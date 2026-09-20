import { sum, median, quantile } from './stats.mjs'

const VSYNC_MS = 1000 / 60
const LONG_FRAME_MS = VSYNC_MS * 1.5
const LONG_TASK_MS = 50

// Main-thread event names reported on their own. They nest inside RunTask
// (and some inside each other), so each is a separate total, never summed.
const MAIN_EVENTS = {
  style: 'UpdateLayoutTree',
  layout: 'Layout',
  prePaint: 'PrePaint',
  paint: 'Paint',
  layerize: 'Layerize',
  commit: 'Commit',
  animationFrame: 'FireAnimationFrame',
  timer: 'TimerFire',
  event: 'EventDispatch'
}
const GC_EVENTS = new Set(['MinorGC', 'MajorGC'])
// Work that means something on screen changed
const VISUAL_EVENTS = new Set(['UpdateLayoutTree', 'Layout', 'Paint'])

// Reads a Chromium trace recorded around one measurement. `page` holds what
// the page recorded in performance.now() time: when the action started
// (`from`) and the requestAnimationFrame timestamps. The transition ends with
// the last style, layout or paint work on the main thread, or the last frame
// the compositor drew for an animation it runs itself, whichever is later.
// The measured window runs from the action to `tailMs` after that.
export function analyzeTrace(trace, page, tailMs) {
  const events = trace.traceEvents || trace
  const mark = events.find((e) => e.name === 'bench:start' && e.cat === 'blink.user_timing')
  if (!mark) throw new Error('bench:start mark missing from trace')
  const pid = mark.pid
  const mainTid = mark.tid
  // trace timestamps are microseconds; convert page time to trace time
  const offsetUs = mark.ts - mark.args.data.startTime * 1000
  const toTrace = (ms) => ms * 1000 + offsetUs
  const toPage = (us) => (us - offsetUs) / 1000
  const from = toTrace(page.from)
  let end = from
  for (const e of events) {
    if (e.pid !== pid || e.ts < from) continue
    if (e.ph === 'X' && e.tid === mainTid && VISUAL_EVENTS.has(e.name)) {
      end = Math.max(end, e.ts + e.dur)
    }
    const frame = e.name === 'PipelineReporter' && e.ph === 'b' && e.args?.frame_reporter
    if (frame && frame.has_compositor_animation && frame.state?.startsWith('STATE_PRESENTED')) {
      end = Math.max(end, e.ts)
    }
  }
  const to = end + tailMs * 1000
  const transitionMs = (end - from) / 1000
  const frames = page.frames.filter((t) => t >= page.from && t <= toPage(to))

  const threadNames = new Map()
  for (const e of events) {
    if (e.name === 'thread_name' && e.pid === pid) threadNames.set(e.tid, e.args.name)
  }
  const compositorTid = [...threadNames].find(([, name]) => name === 'Compositor')?.[0]

  // Duration of an X event that falls inside the window, in ms
  const clipped = (e) => Math.max(0, Math.min(e.ts + e.dur, to) - Math.max(e.ts, from)) / 1000
  const inWindow = (e) => e.ph === 'X' && e.pid === pid && e.ts + e.dur > from && e.ts < to

  const mainTasks = []
  const compositorTasks = []
  const byName = Object.fromEntries(Object.keys(MAIN_EVENTS).map((k) => [k, { count: 0, ms: 0 }]))
  const nameToKey = Object.fromEntries(Object.entries(MAIN_EVENTS).map(([k, v]) => [v, k]))
  let gcMs = 0
  let rasterMs = 0
  let rasterCount = 0

  for (const e of events) {
    if (!inWindow(e)) continue
    if (e.name === 'RunTask' && e.cat === 'disabled-by-default-devtools.timeline') {
      if (e.tid === mainTid) mainTasks.push(e)
      else if (e.tid === compositorTid) compositorTasks.push(e)
    }
    if (e.tid === mainTid && nameToKey[e.name]) {
      const k = nameToKey[e.name]
      byName[k].count++
      byName[k].ms += clipped(e)
    }
    if (e.tid === mainTid && GC_EVENTS.has(e.name)) gcMs += clipped(e)
    if (e.name === 'RasterTask') {
      rasterMs += clipped(e)
      rasterCount++
    }
  }

  // Main-thread time per frame: tasks bucketed between consecutive rAF ticks
  const ticks = frames.map(toTrace)
  const perFrame = []
  for (let i = 0; i + 1 < ticks.length; i++) {
    const a = ticks[i]
    const b = ticks[i + 1]
    perFrame.push(
      sum(mainTasks.map((e) => Math.max(0, Math.min(e.ts + e.dur, b) - Math.max(e.ts, a)) / 1000))
    )
  }

  const intervals = []
  for (let i = 0; i + 1 < frames.length; i++) intervals.push(frames[i + 1] - frames[i])

  // Chromium's own frame accounting
  const reporter = { presented: 0, partial: 0, dropped: 0, noUpdate: 0 }
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b' || e.pid !== pid) continue
    if (e.ts < from || e.ts > to) continue
    const state = e.args?.frame_reporter?.state
    if (state === 'STATE_PRESENTED_ALL') reporter.presented++
    else if (state === 'STATE_PRESENTED_PARTIAL') reporter.partial++
    else if (state === 'STATE_DROPPED') reporter.dropped++
    else if (state === 'STATE_NO_UPDATE_DESIRED') reporter.noUpdate++
  }

  const taskMs = mainTasks.map(clipped)
  const out = {
    transitionMs,
    frames: {
      count: frames.length,
      intervalMedianMs: median(intervals),
      intervalP95Ms: quantile(intervals, 0.95),
      intervalMaxMs: intervals.length ? Math.max(...intervals) : 0,
      longFrames: intervals.filter((d) => d > LONG_FRAME_MS).length,
      missedVsyncs: sum(intervals.map((d) => Math.max(0, Math.round(d / VSYNC_MS) - 1))),
      presented: reporter.presented,
      partial: reporter.partial,
      dropped: reporter.dropped
    },
    main: {
      busyMs: sum(taskMs),
      perFrameMedianMs: median(perFrame),
      perFrameP95Ms: quantile(perFrame, 0.95),
      perFrameMaxMs: perFrame.length ? Math.max(...perFrame) : 0,
      maxTaskMs: taskMs.length ? Math.max(...taskMs) : 0,
      longTasks: taskMs.filter((d) => d > LONG_TASK_MS).length,
      gcMs
    },
    render: {},
    compositor: { busyMs: sum(compositorTasks.map(clipped)), rasterMs, rasterTasks: rasterCount }
  }
  for (const [k, v] of Object.entries(byName)) {
    out.render[`${k}Ms`] = v.ms
    out.render[`${k}Count`] = v.count
  }
  return out
}
