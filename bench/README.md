# Benchmark harness

Measures what `RotatingText` costs the browser, for both variants (the default
roll and `variant="flap"`), on any commit. It bundles the checkout's
`src/index.tsx` into a test page, drives it in Chromium with Playwright on the
real clock, and writes per-variant JSON plus a summary table.

## Run it

```sh
cd bench
npm ci                            # once: esbuild and Playwright
npx playwright install chromium   # once, if Playwright has no Chromium yet
npm run bench                     # measures the working copy (src as it is now)
```

The repository's own dependencies must be installed (`npx pnpm@7 install`).
If they are missing the harness installs them with `--ignore-scripts`, so the
committed `dist` is not rebuilt.

To measure a commit without touching the working copy:

```sh
npm run bench -- --ref main
```

The commit is checked out into a git worktree under `bench/.cache/worktrees`
and its dependencies are installed there once. Any commit with a
`src/index.tsx` works, including ones on React 16.

One commit takes about five minutes with the defaults. Options:

| Option | Default | |
|---|---|---|
| `--ref <ref>` | `.` | Measure this commit (`.` is the working copy); repeat to measure several |
| `--checkout <dir>` | repo root | Measure another directory as it is (not with `--ref <commit>`) |
| `--runs <n>` | 6 | Repetitions of every measurement; the report gives medians |
| `--cpu <rate>` | 4 | Chromium CPU slowdown (4 is roughly a mid-range phone; 1 is none) |
| `--variants` | `roll,flap` | |
| `--lengths` | `short,medium,long` | 4, 12 and 32 characters |
| `--scenarios` | `mount,change,flip,rapid` | |
| `--label <name>` | `<ref>-<sha>-<time>` | Name of the results directory |
| `--out <dir>` | `bench/results/<label>` | Must be new or empty |
| `--headed` | off | Show the browser |

## Compare commits

Measure them in one run:

```sh
npm run bench -- --ref main --ref .      # main against the working copy
```

The harness alternates between the commits for every measurement, so the
machine speeding up or slowing down during the run hits both equally. Each
commit gets its own directory under the results directory, and `compare.md`
lists what changed between the first commit and each of the others.

Two result directories can also be compared afterwards, though runs made at
different times drift more (see Noise):

```sh
npm run compare -- results/before results/after
```

A timing counts as changed when its median moved by more than 15% of the
before value and by more than a per-metric floor (for example 1ms of React
time, 2ms of p95 frame interval), and the two sets of runs are apart (a
Mann-Whitney test, p < 0.05; with 6 runs per side the smallest possible p is
0.002). Commit, render and layout counts are the same in almost every run, so
any change in them counts unless their own runs disagree. `--band 0.1` and
`--alpha 0.01` change the thresholds, and `--all` lists every metric. With
fewer than 4 runs per side the test can't reach 0.05, so only the band is
applied, and the report says so. Runs from different machines or with a
different `--cpu` are not comparable; the report warns about both.

## What each scenario does

Each measurement loads a fresh page, mounts the component at 56px, and then:

- **mount**: renders the component for the first time.
- **change**: changes `text` to another word of the same length, with no hover.
- **flip**: moves the pointer onto the text, which runs one full transition.
- **rapid**: moves the pointer on, then changes `text` every 60ms twelve times
  (faster than any letter's transition) while the pointer leaves and re-enters
  every 150ms.

The page waits until nothing under the component has changed for 300ms and no
Web Animation is running, so it follows whatever timing the component uses.
Runs are interleaved (every cell once, then again) so drift in the machine
spreads across all cells.

## What is measured

The measured window runs from the action to 100ms after the last style
recalculation, layout or paint on the main thread (read from the trace):

- **transitionMs**: from the action to that last style, layout or paint.
- **React**: commits and their `actualDuration` from `<Profiler>` (the page
  uses react-dom's profiling build in production mode), and how many
  components rendered, counted from the fiber tree through a minimal DevTools
  hook (`renderByName` in the JSON breaks it down by component).
- **Frames**: `requestAnimationFrame` intervals (median, p95, max), long
  frames (more than 25ms apart, 1.5 vsyncs), missed vsyncs, and Chromium's own
  presented and dropped frame counts from the trace.
- **Main thread**: total task time, task time between each pair of frames
  (median, p95, max), longest task, tasks over 50ms, GC time.
- **Rendering**: count and time of style recalculation (`UpdateLayoutTree`),
  layout, pre-paint, paint, layerize and commit on the main thread, raster
  tasks and compositor-thread time. `cdp.*` holds layout and style counters
  from the DevTools Performance domain as a cross-check (these cover the whole
  measurement, including the wait for the page to settle).
- **Layout shift**: the component sits in a line of text ("Go … now") with a
  paragraph below it, so a change in its size moves other content.
  `layoutShift.score` sums Chromium's layout-shift entries (what CLS adds up)
  and `count` counts them; `maxMovePx` is the furthest any shifted element
  moved and `neighbourMovePx` how far the text after or below the component was
  pushed; `resizes`, `maxWidthChangePx` and `maxHeightChangePx` track the box
  holding the component. For flips, `restDriftPx` compares every visible
  element's drawn box (transforms included) before the flip and after it
  settles, so a letter or tile that lands a fraction of a pixel off, or a roll
  whose incoming face doesn't land exactly where the outgoing one was, shows
  up. Layout-shift entries don't see movement made by transforms during the
  animation; the frame and paint metrics cover that.

## Output

`results/<label>/` holds `roll.json` and `flap.json` (every run, plus the
median, min and max of every metric for each length and scenario),
`meta.json` (commit, React and Chromium versions, machine, settings) and
`summary.md` (the table, then the run-to-run spread of the timing metrics).

## Noise

Measured on a 4-core cloud VM with the defaults (6 runs, 4x CPU slowdown).
"Separate runs" is the same commit measured in two runs at different times
(e83fa39 and 05c9184, each twice); "interleaved" is one commit measured twice
within one run. Each cell gives the median and worst change across the 24
length and scenario cells of both variants.

| Metric | Separate runs | Interleaved |
|---|--:|--:|
| Renders, layout shift, neighbour and frame move px | identical | identical |
| Commits, layout count | identical, except flap on 05c9184 (up to 29%) | identical |
| React ms | 4–8% / 34% | 4% / 12% |
| Transition ms | 0–5% / 21% | 1% / 7% |
| Main-thread busy ms | 4–5% / 28% | 2% / 7% |
| Raster ms | 5–8% / 51% | 5% / 19% |
| Style recalc ms | 3–7% / 86% | 5% / 50% |
| Main ms/frame p95 | 5–8% / 60% | 4% / 82% |
| Paint ms | 14% / 109% | 7% / 92% |

Most metrics sit well inside the 15% band. The worst cases are cells where the
value is a few milliseconds, or where one frame lands either side of a vsync
(p95 values in the short mount and change scenarios), and mount and change in
general, which are single commits. Commit counts are exact as long as the
component only commits when its props change; the flap on 05c9184 also commits
during its animation, so how many commits land in a run depends on timing.
The compare rule flagged 4 to 11 of about 650 medians between repeated runs of
the same commit, all in those cells. Treat a lone flagged p95 or paint value
in mount or change with suspicion; a change that shows up across lengths or in
the totals is real.

## Caveats

- Headless Chromium rasterizes in software, so raster and composite times are
  higher than on a laptop GPU. Compare runs to each other, not to a device.
- Some of the harness runs inside the measured page: a `requestAnimationFrame`
  loop that timestamps every frame (it also keeps frames coming while the
  component is idle, which adds a little layerize and commit time), a check
  every 50ms of whether the component has settled, and the render-counting
  hook, which walks the component's fibers once per React commit. Their cost
  is small next to the component's, but the hook's grows with the number of
  commits and fibers.
- Timings on a shared or busy machine are noisier. Check the spread table in
  `summary.md` before trusting a small difference.
