# Minori walkthrough video

One command records the portfolio walkthrough of Minori from scratch and cuts it:

```
pnpm demo:record
```

It needs Docker Desktop running (for the Postgres from `docker compose`), `ffmpeg` and `ffprobe` on the PATH, and Playwright's Chromium (`pnpm --filter @diet-tracker/demo exec playwright install chromium` once on a new machine). A run takes about two and a half minutes.

## What comes out

| File | What it is |
|---|---|
| `demo/output/minori-walkthrough.mp4` | The full walkthrough: a 2 s title card, then the take. H.264, 780x1688 (a 390x844 phone at 2x), 30 fps, no audio. |
| `demo/output/minori-loop.mp4` | The highlights in about 15 s for a portfolio grid: 540 wide, no audio, ends on its first frame so it loops without a seam. |
| `demo/output/minori-poster.jpg` | A still (the day just met) for `<video poster>`. |

`demo/output/` and `demo/.cache/` are git-ignored.

## What the film shows

One continuous take, two journeys, as Jamie (the demo account) on a Thursday evening:

1. Today at 18:42: dinner still to log.
2. Tap +, type the dinner, the AI estimates it item by item (two matched to My foods).
3. Add it: the ring closes and the day turns to "Day met"; scroll the log and the micronutrients.
4. Week: days met, streak, where the week is lacking, the AI's review.
5. Flip Food to Gym.
6. Open the session in progress, tick the last three sets, finish it.
7. Gym Week: four of four sessions, week on week.
8. Lifts, then Barbell bench press: three months of trend.
9. Ask the coach "Am I eating enough to keep getting stronger?" and watch the answer stream in.

## How it stays repeatable

- **Its own database.** `minori_demo`, in the same Postgres container as the dev database, dropped, migrated and re-seeded on every run. Your dev data, Finn and Tess are never touched.
- **A pinned clock.** The API, the seed and the browser all believe it is `2026-11-12T18:42:00Z` (a Thursday). `clock.mjs` shifts `Date` in the Node processes and `lib/browser.ts` does the same in the page; the app's code is unchanged. Change it with `DEMO_NOW`, then re-record the AI answers.
- **Recorded AI answers.** The API is pointed at `openai-replay.ts` with `OPENAI_BASE_URL`. Normally it replays the real gpt-5.5 answers saved in `fixtures/openai/` at a watchable pace: free, offline, word for word the same every take. `pnpm demo:record --live` calls OpenAI for real (a few pence, key from `apps/api/.env` or `DEMO_OPENAI_API_KEY`), saves the new answers, and makes the film from that take with the real waits left in; run it once more without `--live` for the paced version.
- **Its own ports.** The app on 4710 and the OpenAI stand-in on 4711 (`DEMO_APP_PORT`, `DEMO_OPENAI_PORT`), so nothing on 3000 or 5173 is disturbed. The web app is a production build in `demo/.cache/web`; `apps/web/dist` is left alone.

## Files

| File | Job |
|---|---|
| `run.ts` | The pipeline behind `pnpm demo:record`: database, seed, build, servers, record, post. |
| `config.ts` | Paths, ports, the demo database, the demo account, the pinned clock, the video size. |
| `seed.ts`, `data/` | Jamie: profile and targets, 13 weeks of weigh-ins and gym sessions, 3 weeks of meals, a food library and saved meals. Goes through the app's own services. |
| `record.ts` | The choreography, step by step. Edit this to change what the film shows. |
| `lib/human.ts`, `lib/cursor.ts` | The hand: eased pointer glides, the finger dot and tap ripple, uneven typing, thumb swipes. |
| `lib/browser.ts` | The phone: 390x844 laid out at 2x, signed in, dark theme, demo clock. |
| `lib/stack.ts` | Starting and stopping the demo database, web build and API. |
| `openai-replay.ts` | The OpenAI record/replay stand-in. |
| `post.ts` | ffmpeg: sync, trim, title card, master, loop, poster. |
| `review.mjs` | Frames for checking a take by eye (below). |

## Flags

```
pnpm demo:record --live        # re-record the AI answers from OpenAI
pnpm demo:record --post-only   # redo the ffmpeg step on the last take
pnpm demo:record --skip-post   # record only
pnpm demo:record --rebuild     # force a fresh web build
pnpm demo:record --serve       # start the demo app and leave it up to look around (Ctrl+C stops it)
```

`--serve` prints the demo sign-in. The demo account exists only in `minori_demo`.

## Checking a take

`pnpm --filter @diet-tracker/demo review` writes frames to `demo/.cache/review/`: contact sheets of the walkthrough (a frame every 2 s), the loop at two frames a second, and 10 fps strips around every screen change, which is where a loading skeleton or a number from before the change would show. Look at those after any change to the app or to `record.ts`.

## Changing things

- **Different wording typed in the film, a different question, or new seed numbers:** edit `record.ts` or `data/`, then run once with `--live` so the AI answers match, then once without.
- **The app's UI changed:** the take fails on the selector it could not find and leaves `demo/.cache/failed.png` showing the screen at that moment. Fix the step in `record.ts`.
- **Pacing:** the `hand.pause(...)` beats in `record.ts`; replay pacing of AI answers is `PACING` in `openai-replay.ts`.
- **Title card and loop:** `renderTitleCard` and the `clips` list in `post.ts`; the name and pitch are in `config.ts`.
