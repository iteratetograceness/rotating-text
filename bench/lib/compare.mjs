import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mannWhitneyP, minMannWhitneyP } from './stats.mjs'

// Metrics compared, and the smallest change that counts regardless of the
// relative band. Exact metrics are counts that are almost always the same in
// every run: any change counts, unless the runs themselves disagree.
export const METRICS = {
  'react.commits': { exact: true },
  'react.renders': { exact: true },
  'react.commitMs': { floor: 1 },
  transitionMs: { floor: 20 },
  'frames.count': { floor: 3 },
  'frames.intervalP95Ms': { floor: 2 },
  'frames.longFrames': { floor: 1 },
  'frames.missedVsyncs': { floor: 2 },
  'main.busyMs': { floor: 5 },
  'main.perFrameMedianMs': { floor: 0.5 },
  'main.perFrameP95Ms': { floor: 1 },
  'main.maxTaskMs': { floor: 3 },
  'render.styleCount': { floor: 2 },
  'render.styleMs': { floor: 1 },
  'render.layoutCount': { exact: true },
  'render.layoutMs': { floor: 1 },
  'render.paintCount': { floor: 3 },
  'render.paintMs': { floor: 1 },
  'render.layerizeMs': { floor: 1 },
  'render.commitMs': { floor: 1 },
  'compositor.busyMs': { floor: 5 },
  'compositor.rasterMs': { floor: 1 },
  'layoutShift.score': { floor: 0.0005 },
  'layoutShift.count': { exact: true },
  'layoutShift.neighbourMovePx': { floor: 1 },
  'layoutShift.maxWidthChangePx': { floor: 1 },
  'layoutShift.frameMovePx': { floor: 1 },
  'layoutShift.frameMovedElements': { exact: true },
  'layoutShift.restDriftPx': { floor: 0.5 }
}

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null)
const constant = (xs) => xs.every((x) => x === xs[0])

// Markdown listing the medians that moved beyond the noise band between two
// result directories written by run.mjs.
export function compareDirs(beforeDir, afterDir, { band = 0.15, alpha = 0.05, all = false } = {}) {
  const beforeMeta = readJson(join(beforeDir, 'meta.json'))
  const afterMeta = readJson(join(afterDir, 'meta.json'))
  if (!beforeMeta || !afterMeta) throw new Error('Both directories need a meta.json from run.mjs')
  const lines = [`# ${beforeMeta.label} → ${afterMeta.label}`, '']
  for (const k of ['cpuThrottle', 'chromium', 'host', 'viewport']) {
    if (beforeMeta[k] !== afterMeta[k]) {
      lines.push(`Warning: ${k} differs (${beforeMeta[k]} vs ${afterMeta[k]}), so timings are not comparable.`, '')
    }
  }
  if (beforeMeta.session && beforeMeta.session !== afterMeta.session) {
    lines.push(
      'Note: these were measured in separate sessions, so machine drift adds to the noise. ' +
        'Measuring both in one run (`--ref a --ref b`) interleaves them and is more reliable.',
      ''
    )
  }
  lines.push(
    `A timing change counts when its median moved by more than ${Math.round(band * 100)}% of the before ` +
      `value and the metric's absolute floor, and the runs of the two sides are apart (Mann-Whitney ` +
      `p < ${alpha}). Commit, render and layout counts count on any change, unless their own runs vary ` +
      'and overlap.',
    ''
  )

  let counted = 0
  let compared = 0
  let fewRuns = false
  const missing = []
  for (const variant of ['roll', 'flap']) {
    const a = readJson(join(beforeDir, `${variant}.json`))
    const b = readJson(join(afterDir, `${variant}.json`))
    if (!a || !b) continue
    const rows = []
    for (const [length, byScenario] of Object.entries(a.results)) {
      for (const [scenario, cellA] of Object.entries(byScenario)) {
        const cellB = b.results[length]?.[scenario]
        if (!cellB) continue
        if (!cellA.runs.length || !cellB.runs.length) {
          missing.push(`${variant} ${length} ${scenario}`)
          continue
        }
        // With too few runs no p can reach alpha; fall back to the band alone
        const testable = minMannWhitneyP(cellA.runs.length, cellB.runs.length) < alpha
        if (!testable) fewRuns = true
        for (const [key, rule] of Object.entries(METRICS)) {
          const x = cellA.median[key]
          const y = cellB.median[key]
          if (x === undefined || y === undefined) continue
          compared++
          const d = y - x
          const xs = cellA.runs.map((r) => r[key])
          const ys = cellB.runs.map((r) => r[key])
          const p = mannWhitneyP(xs, ys)
          const apart = !testable || p < alpha
          const real = rule.exact
            ? d !== 0 && ((constant(xs) && constant(ys)) || apart)
            : Math.abs(d) > Math.max(band * Math.abs(x), rule.floor) && apart
          if (real) counted++
          if (real || all) {
            const pct = x ? `${d > 0 ? '+' : ''}${Math.round((d / Math.abs(x)) * 100)}%` : 'new'
            const verdict = real ? (d < 0 ? 'lower' : 'higher') : 'noise'
            const pText = rule.exact || !testable ? '' : p.toFixed(3)
            rows.push(`| ${length} | ${scenario} | ${key} | ${x} | ${y} | ${pct} | ${pText} | ${verdict} |`)
          }
        }
      }
    }
    lines.push(`## ${variant}`, '')
    if (!rows.length) {
      lines.push('No change beyond noise.', '')
      continue
    }
    lines.push('| Length | Scenario | Metric | Before | After | Change | p | |', '|---|---|---|--:|--:|--:|--:|---|')
    lines.push(...rows, '')
  }
  if (missing.length) {
    lines.push(`Not compared, because every run failed on one side: ${missing.join(', ')}.`, '')
  }
  if (fewRuns) {
    lines.push('Too few runs for the Mann-Whitney test (it needs 4 or more per side), so only the band was applied.', '')
  }
  lines.push(`${counted} of ${compared} compared medians changed beyond noise.`, '')
  return lines.join('\n')
}
