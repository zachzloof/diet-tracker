import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { APP, PATHS, VIDEO_SIZE } from './config.js'
import { log, run } from './lib/stack.js'
import type { Take } from './record.js'

/**
 * ffmpeg turns the raw take into what goes on the portfolio:
 *
 *   output/minori-walkthrough.mp4   title card, then the take trimmed to the film, H.264
 *   output/minori-loop.mp4          the highlights in about 15 s, no sound, loops cleanly
 *   output/minori-poster.jpg        a still for the <video poster> and link previews
 *
 * The take's cut points are wall-clock times from record.ts; the magenta sync flash in the
 * pre-roll says which video frame a given wall-clock time is.
 */

const FPS = 30
const TITLE_SECONDS = 2
const FADE = 0.45
const LOOP_WIDTH = 540
const LOOP_FADE = 0.3

const OUTPUT = {
  master: join(PATHS.output, 'minori-walkthrough.mp4'),
  loop: join(PATHS.output, 'minori-loop.mp4'),
  poster: join(PATHS.output, 'minori-poster.jpg'),
} as const

const ffmpeg = (args: string[]): Promise<string> =>
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: PATHS.demo })

async function probe(file: string): Promise<{ seconds: number; width: number; height: number }> {
  const output = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      file,
    ],
    { cwd: PATHS.demo },
  )
  const parsed = JSON.parse(output) as {
    streams: { width: number; height: number }[]
    format: { duration: string }
  }
  const stream = parsed.streams[0]
  if (!stream) throw new Error(`ffprobe found no video in ${file}`)
  return { seconds: Number(parsed.format.duration), width: stream.width, height: stream.height }
}

/**
 * Seconds into the raw video at which the sync flash first shows. Decodes the opening of the
 * video down to one pixel a frame and looks for magenta.
 */
function findFlash(video: string): Promise<number> {
  const RAW_FPS = 25 // Playwright's recorder writes a constant 25 fps.
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-t', '60', '-i', video].concat([
        '-vf',
        'scale=1:1:flags=area',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]),
      { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true },
    )
    const parts: Buffer[] = []
    child.stdout.on('data', (part: Buffer) => parts.push(part))
    child.on('error', reject)
    child.on('close', () => {
      const pixels = Buffer.concat(parts)
      for (let frame = 0; frame * 3 + 2 < pixels.length; frame += 1) {
        const [r, g, b] = [pixels[frame * 3], pixels[frame * 3 + 1], pixels[frame * 3 + 2]]
        if (r !== undefined && g !== undefined && b !== undefined && r > 180 && g < 90 && b > 180) {
          return resolve(frame / RAW_FPS)
        }
      }
      reject(new Error('the sync flash is not in the recording; was the pre-roll cut short?'))
    })
  })
}

/** The title card: the app icon, its name and the one-line pitch, in the app's own colours. */
async function renderTitleCard(file: string): Promise<void> {
  const icon = await readFile(join(PATHS.web, 'public/icons/icon-512.png'))
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; height: 100%; }
    body { background: radial-gradient(120% 80% at 50% 38%, #16202a 0%, #0c0f14 62%);
      color: #f3f5f7; display: flex; flex-direction: column; align-items: center;
      justify-content: center; text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; }
    img { width: 232px; height: 232px; border-radius: 52px;
      box-shadow: 0 0 0 2px rgba(255,255,255,0.07), 0 30px 80px rgba(0,0,0,0.55); }
    h1 { margin: 64px 0 0; font-size: 104px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
    p { margin: 36px 0 0; max-width: 560px; font-size: 38px; line-height: 1.35; color: #a6b0bd; }
    small { margin-top: 56px; font-size: 26px; letter-spacing: 0.14em; text-transform: uppercase;
      color: #7ef29a; font-weight: 600; }
  </style></head><body>
    <img src="data:image/png;base64,${icon.toString('base64')}" alt="">
    <h1>${APP.name}</h1>
    <p>${APP.pitch}</p>
    <small>${APP.tagline}</small>
  </body></html>`
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: VIDEO_SIZE, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.screenshot({ path: file })
  } finally {
    await browser.close()
  }
}

interface Clip {
  /** Seconds into the raw video. */
  from: number
  seconds: number
}

/**
 * Cross-fades the clips into each other and, last, back into the opening frames of the first,
 * so the file's last frame is its first and a looping player shows no seam.
 */
function loopFilter(clips: Clip[]): string {
  const prepared = clips.map(
    (_clip, index) =>
      `[${index}:v]fps=${FPS},scale=${LOOP_WIDTH}:-2:flags=lanczos,format=yuv420p,setpts=PTS-STARTPTS[c${index}]`,
  )
  const chain: string[] = []
  let previous = 'c0'
  let length = clips[0]?.seconds ?? 0
  for (let index = 1; index < clips.length; index += 1) {
    const clip = clips[index]
    if (!clip) continue
    const out = index === clips.length - 1 ? 'v' : `x${index}`
    chain.push(
      `[${previous}][c${index}]xfade=transition=fade:duration=${LOOP_FADE}:offset=${(length - LOOP_FADE).toFixed(3)}[${out}]`,
    )
    length += clip.seconds - LOOP_FADE
    previous = out
  }
  return [...prepared, ...chain].join(';')
}

export async function postProcess(take: Take): Promise<string[]> {
  await mkdir(PATHS.output, { recursive: true })
  await rm(PATHS.frames, { recursive: true, force: true })
  await mkdir(PATHS.frames, { recursive: true })

  const flashAt = await findFlash(take.video)
  /** Wall-clock ms to seconds into the raw video. */
  const at = (wallMs: number): number => flashAt + (wallMs - take.syncAt) / 1000
  const start = at(take.startAt)
  const end = at(take.endAt)
  const body = end - start
  const mark = (name: string): number => {
    const value = take.marks[name]
    if (value === undefined) throw new Error(`the take has no "${name}" mark`)
    return at(value)
  }
  log(`film is ${body.toFixed(1)} s of the raw take (${start.toFixed(2)} s to ${end.toFixed(2)} s)`)
  // Where the film sits in the raw take, for review.mjs.
  const cut = Object.fromEntries(Object.keys(take.marks).map((name) => [name, mark(name)]))
  await writeFile(
    join(PATHS.cache, 'cut.json'),
    JSON.stringify({ video: take.video, start, end, marks: cut }, null, 2),
    'utf8',
  )

  // --- The walkthrough: title card, cross-fade into the film, fade out at the end ---------
  const title = join(PATHS.frames, 'title.png')
  await renderTitleCard(title)
  const total = TITLE_SECONDS + body
  await ffmpeg([
    ...[
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-t',
      (TITLE_SECONDS + FADE).toFixed(3),
      '-i',
      title,
    ],
    ...['-ss', start.toFixed(3), '-t', body.toFixed(3), '-i', take.video],
    '-filter_complex',
    [
      `[0:v]format=yuv420p,fade=t=in:st=0:d=0.3[title]`,
      `[1:v]fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[film]`,
      `[title][film]xfade=transition=fade:duration=${FADE}:offset=${TITLE_SECONDS}[joined]`,
      `[joined]fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[v]`,
    ].join(';'),
    ...['-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'],
    ...['-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTPUT.master],
  ])

  // --- The loop: five moments, about fifteen seconds ---------------------------------------
  const first: Clip = { from: start + 0.3, seconds: 1.9 }
  const clips: Clip[] = [
    first, // Today as it stands
    { from: mark('review') - 0.25, seconds: 2.7 }, // the AI's estimate
    { from: mark('logged') - 0.1, seconds: 2.9 }, // the day is met
    { from: mark('sets') - 0.25, seconds: 3.3 }, // ticking sets
    { from: mark('lift') - 0.1, seconds: 2.3 }, // three months of bench press
    { from: end - 6.2, seconds: 4.4 }, // the coach answers
    { from: first.from, seconds: LOOP_FADE + 0.05 }, // back to the start
  ]
  await ffmpeg([
    ...clips.flatMap((clip) => [
      ...['-ss', clip.from.toFixed(3), '-t', clip.seconds.toFixed(3), '-i', take.video],
    ]),
    ...['-filter_complex', loopFilter(clips), '-map', '[v]', '-an'],
    ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'],
    ...['-movflags', '+faststart', OUTPUT.loop],
  ])

  // --- The poster: the day just met, once the toast has gone ------------------------------
  await ffmpeg([
    ...['-ss', (mark('poster') + 0.15).toFixed(3), '-i', take.video],
    ...['-frames:v', '1', '-q:v', '2', OUTPUT.poster],
  ])

  const lines: string[] = []
  for (const file of [OUTPUT.master, OUTPUT.loop]) {
    const info = await probe(file)
    lines.push(`${file}  ${info.seconds.toFixed(1)} s, ${info.width}x${info.height}`)
  }
  lines.push(OUTPUT.poster)
  return lines
}
