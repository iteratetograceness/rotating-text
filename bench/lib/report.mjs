import { median } from './stats.mjs'

// The columns of the summary table: [heading, metric key, decimals]
export const COLUMNS = [
  ['Commits', 'react.commits', 0],
  ['Renders', 'react.renders', 0],
  ['React ms', 'react.commitMs', 1],
  ['Transition ms', 'transitionMs', 0],
  ['Frames', 'frames.count', 0],
  ['p95 frame ms', 'frames.intervalP95Ms', 1],
  ['Long frames', 'frames.longFrames', 0],
  ['Main ms/frame p95', 'main.perFrameP95Ms', 2],
  ['Main busy ms', 'main.busyMs', 1],
  ['Longest task ms', 'main.maxTaskMs', 1],
  ['Style n / ms', ['render.styleCount', 'render.styleMs'], 1],
  ['Layout n / ms', ['render.layoutCount', 'render.layoutMs'], 1],
  ['Paint n / ms', ['render.paintCount', 'render.paintMs'], 1],
  ['Composite ms', ['render.layerizeMs', 'render.commitMs'], 1],
  ['Raster ms', 'compositor.rasterMs', 1],
  ['Layout shift', 'layoutShift.score', 4],
  ['Neighbour move px', 'layoutShift.neighbourMovePx', 1],
  ['Frame move px', 'layoutShift.frameMovePx', 1],
  ['Rest drift px', 'layoutShift.restDriftPx', 2]
]

const fmt = (x, d) => (x === undefined ? '-' : Number(x).toFixed(d))

const cellText = (m, key, d) => {
  if (Array.isArray(key) && key[0].endsWith('Count')) return `${fmt(m[key[0]], 0)} / ${fmt(m[key[1]], d)}`
  if (Array.isArray(key)) return fmt(key.reduce((a, k) => a + (m[k] || 0), 0), d)
  return fmt(m[key], d)
}

// Relative run-to-run spread of one metric in one cell: (max - min) / median
export const spread = (cell, key) => {
  const m = cell.median[key]
  if (!m) return cell.max[key] === cell.min[key] ? 0 : Infinity
  return (cell.max[key] - cell.min[key]) / Math.abs(m)
}

export function summarize(meta, results) {
  const lines = []
  lines.push(`# RotatingText benchmark: ${meta.label}`)
  lines.push('')
  lines.push(
    `Commit ${meta.commit.slice(0, 7)}${meta.srcModified ? ' (src modified)' : ''}, React ${meta.react}, ` +
      `${meta.runs} runs, CPU slowdown ${meta.cpuThrottle}x, Chromium ${meta.chromium}, ${meta.viewport}, ` +
      `${meta.host}. Medians across runs.`
  )
  lines.push('')
  lines.push(
    'Composite = Layerize + Commit on the main thread. Main ms/frame = main-thread task time between two ' +
      'animation frames. Long frames are more than 25ms apart (1.5 vsyncs). Layout shift is the sum of ' +
      'layout-shift entries (what CLS adds up); neighbour move is how far the text after or below the ' +
      'component was pushed; frame move (flip and change) is the furthest any element\'s layout box moved ' +
      'from where it was, checked every frame; rest drift (flip only) is how far anything visible comes ' +
      'to rest from where it started.'
  )
  for (const [variant, byLength] of Object.entries(results)) {
    lines.push('')
    lines.push(`## ${variant}`)
    lines.push('')
    lines.push(`| Length | Scenario | ${COLUMNS.map((c) => c[0]).join(' | ')} |`)
    lines.push(`|---|---|${COLUMNS.map(() => '--:').join('|')}|`)
    for (const [length, byScenario] of Object.entries(byLength)) {
      for (const [scenario, cell] of Object.entries(byScenario)) {
        const row = COLUMNS.map(([, key, d]) => cellText(cell.median, key, d))
        lines.push(`| ${length} | ${scenario} | ${row.join(' | ')} |`)
      }
    }
    const errors = Object.entries(byLength).flatMap(([l, bs]) =>
      Object.entries(bs).flatMap(([s, cell]) => cell.errors.map((e) => `${l} ${s}: ${e}`))
    )
    if (errors.length) {
      lines.push('')
      lines.push('Problems:')
      for (const e of errors.slice(0, 20)) lines.push(`- ${e}`)
    }
  }

  // Noise: for each timing metric, the median and worst relative spread across
  // cells where the metric is big enough to matter
  lines.push('')
  lines.push('## Run-to-run spread')
  lines.push('')
  lines.push('(max - min) / median across runs, over cells where the median is at least 1ms or 1 count.')
  lines.push('')
  lines.push('| Metric | Median spread | Worst spread |')
  lines.push('|---|--:|--:|')
  const keys = ['react.commitMs', 'transitionMs', 'frames.intervalP95Ms', 'main.perFrameP95Ms', 'main.busyMs', 'render.styleMs', 'render.paintMs', 'compositor.rasterMs']
  for (const key of keys) {
    const spreads = []
    for (const byLength of Object.values(results)) {
      for (const byScenario of Object.values(byLength)) {
        for (const cell of Object.values(byScenario)) {
          if (Math.abs(cell.median[key] || 0) >= 1) spreads.push(spread(cell, key))
        }
      }
    }
    if (!spreads.length) continue
    lines.push(`| ${key} | ${(median(spreads) * 100).toFixed(0)}% | ${(Math.max(...spreads) * 100).toFixed(0)}% |`)
  }
  lines.push('')
  return lines.join('\n')
}
