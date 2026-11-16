// Frames for checking a take by eye, written to demo/.cache/review/:
//
//   sheet-N.jpg   the finished walkthrough, one frame every 2 s, 24 to a sheet
//   loop.jpg      the short loop, two frames a second
//   at-NAME.jpg   10 frames a second around each screen change in the raw take, where a
//                 loading flash or a stale number would show up
//
// Run after `pnpm demo:record`: `pnpm --filter @diet-tracker/demo review`.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const demo = fileURLToPath(new URL('.', import.meta.url))
const out = join(demo, '.cache/review')
const cut = JSON.parse(readFileSync(join(demo, '.cache/cut.json'), 'utf8'))
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args])

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

ffmpeg(
  '-i',
  join(demo, 'output/minori-walkthrough.mp4'),
  '-vf',
  'fps=1/2,scale=300:-2,tile=6x4',
  '-q:v',
  '3',
  join(out, 'sheet-%d.jpg'),
)
ffmpeg(
  '-i',
  join(demo, 'output/minori-loop.mp4'),
  '-vf',
  'fps=2,scale=220:-2,tile=8x4',
  '-q:v',
  '3',
  join(out, 'loop.jpg'),
)

/** Seconds before each mark and how long to look. */
const AROUND = {
  logged: [-1.2, 2.4],
  week: [-1.6, 2.0],
  gym: [-1.6, 3.2],
  sets: [-5.2, 2.4],
  finished: [1.2, 2.4],
  lift: [-2.6, 3.0],
  coach: [-3.4, 3.2],
}
for (const [name, [before, seconds]] of Object.entries(AROUND)) {
  const at = cut.marks[name]
  if (at === undefined) continue
  ffmpeg(
    '-ss',
    (at + before).toFixed(2),
    '-t',
    String(seconds),
    '-i',
    cut.video,
    '-vf',
    `fps=10,scale=170:-2,tile=${Math.ceil((seconds * 10) / 2)}x2`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(out, `at-${name}.jpg`),
  )
}
console.log(`[demo] review frames in ${out}`)
