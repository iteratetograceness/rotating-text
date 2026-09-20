#!/usr/bin/env node
// Measures RotatingText on one or more checkouts. See README.md.
import { chromium } from 'playwright'
import { parseArgs } from 'node:util'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { buildPage } from './lib/build.mjs'
import { resolveCheckout } from './lib/checkout.mjs'
import { analyzeTrace } from './lib/trace.mjs'
import { SCENARIOS, TEXTS, OUTSIDE } from './lib/scenarios.mjs'
import { median, round, sum } from './lib/stats.mjs'
import { summarize } from './lib/report.mjs'
import { compareDirs } from './lib/compare.mjs'

const benchDir = dirname(fileURLToPath(import.meta.url))
const repo = resolve(benchDir, '..')

const { values: opts } = parseArgs({
  options: {
    ref: { type: 'string', multiple: true },
    checkout: { type: 'string' },
    runs: { type: 'string', default: '6' },
    cpu: { type: 'string', default: '4' },
    variants: { type: 'string', default: 'roll,flap' },
    lengths: { type: 'string', default: 'short,medium,long' },
    scenarios: { type: 'string', default: Object.keys(SCENARIOS).join(',') },
    out: { type: 'string' },
    label: { type: 'string' },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  }
})

if (opts.help) {
  console.log(`Usage: npm run bench -- [options]

  --ref <git ref>       measure this commit ('.' is the working copy); repeat
                        to measure several commits interleaved in one run
  --checkout <dir>      measure this directory instead of the repo
  --runs <n>            repetitions of every measurement (default 6)
  --cpu <rate>          Chromium CPU slowdown, 1 = none (default 4)
  --variants <list>     roll,flap
  --lengths <list>      short,medium,long
  --scenarios <list>    ${Object.keys(SCENARIOS).join(',')}
  --out <dir>           where to write results (default bench/results/<label>)
  --label <name>        name for this run (default <ref>-<sha>-<time>)
  --headed              show the browser`)
  process.exit(0)
}

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
const runs = Number(opts.runs)
const cpu = Number(opts.cpu)
const variants = list(opts.variants)
const lengths = list(opts.lengths)
const scenarios = list(opts.scenarios)
for (const s of scenarios) if (!SCENARIOS[s]) throw new Error(`Unknown scenario ${s}`)
for (const l of lengths) if (!TEXTS[l]) throw new Error(`Unknown length ${l}`)
for (const v of variants) if (!['roll', 'flap'].includes(v)) throw new Error(`Unknown variant ${v}`)
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a whole number, 1 or more')
if (!(cpu >= 1)) throw new Error('--cpu must be a number, 1 or more')

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-')
const cacheDir = join(benchDir, '.cache')
const refs = opts.ref && opts.ref.length ? opts.ref : ['.']
if (opts.checkout && refs.some((r) => r !== '.')) {
  throw new Error('--checkout measures a directory as it is; it cannot be combined with --ref <commit>')
}

// Everything measured in this run: one entry per ref
const targets = []
for (const ref of refs) {
  const checkout = resolveCheckout({ repo, ref, checkout: opts.checkout, cacheDir })
  const name = ref === '.' ? (opts.checkout ? 'checkout' : 'working') : ref.replace(/[^\w.-]+/g, '_')
  let label = `${name}-${checkout.sha.slice(0, 7)}${checkout.dirty ? '-dirty' : ''}`
  if (refs.length === 1 && opts.label) label = opts.label
  while (targets.some((t) => t.label === label)) label += '+'
  console.log(`Building ${label} from ${checkout.dir}`)
  const pagePath = await buildPage(checkout.dir, join(cacheDir, 'page', label))
  targets.push({ ref, label, checkout, pageUrl: pathToFileURL(pagePath).href })
}
const runLabel = opts.label || (targets.length === 1 ? `${targets[0].label}-${stamp}` : `${stamp}-${targets.map((t) => t.label).join('-vs-')}`)
const outDir = resolve(opts.out || join(benchDir, 'results', runLabel))
if (existsSync(outDir) && readdirSync(outDir).length) {
  throw new Error(`${outDir} already holds results; pick another --label or --out`)
}
mkdirSync(outDir, { recursive: true })

const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing'
]
const QUIET_MS = 300 // no DOM changes for this long means the transition ended
const CAP_MS = 15000
const TAIL_MS = 100 // measured past the last style/layout/paint, to catch its frame
const VIEWPORT = { width: 1800, height: 400 } // wide enough for 32 flap tiles at 56px

const browser = await chromium.launch({
  channel: 'chromium',
  headless: !opts.headed,
  args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling']
})
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })

const cdpMetrics = async (cdp) => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}

async function measureOnce(pageUrl, variant, length, scenarioName) {
  const scenario = SCENARIOS[scenarioName]
  const texts = TEXTS[length]
  const props = { text: texts[0], variant }
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  let tracing = false
  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    await page.goto(pageUrl)
    await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
    if (scenario.mounted !== false) {
      await page.evaluate((p) => window.__bench.mount(p), props)
      const setup = await page.evaluate((q) => window.__bench.waitSettled(q, 5000), QUIET_MS)
      if (setup.capped) errors.push('still changing 5s after mounting; the measurement started mid-activity')
    }
    const boxesBefore = await page.evaluate(() => window.__bench.boxes())
    const before = await cdpMetrics(cdp)
    await browser.startTracing(page, { categories: TRACE_CATEGORIES })
    tracing = true
    await page.evaluate(() => {
      window.__bench.reset()
      performance.mark('bench:start')
      window.__bench.startFrames()
    })
    await scenario.act(page, { props, texts })
    const settled = await page.evaluate(
      ({ quiet, cap }) => window.__bench.waitSettled(quiet, cap),
      { quiet: QUIET_MS, cap: CAP_MS }
    )
    const recorded = await page.evaluate(() => {
      const B = window.__bench
      B.stopFrames()
      return {
        from: B.trigger,
        frames: B.frames,
        shifts: B.shifts,
        resizes: B.resizes,
        commits: B.commits,
        renders: B.renders,
        hookError: B.hookError
      }
    })
    tracing = false
    const trace = JSON.parse((await browser.stopTracing()).toString())
    const boxesAfter = await page.evaluate(() => window.__bench.boxes())
    let geometry = null
    if (scenario.geometry) {
      await page.evaluate(() => window.__bench.startGeometry())
      await scenario.geometry(page, { props, texts })
      await page.evaluate(({ quiet, cap }) => window.__bench.waitSettled(quiet, cap), { quiet: QUIET_MS, cap: CAP_MS })
      geometry = await page.evaluate(() => window.__bench.stopGeometry())
    }
    const after = await cdpMetrics(cdp)
    if (recorded.hookError) errors.push(recorded.hookError)

    const renderByName = {}
    for (const r of recorded.renders) {
      for (const [name, n] of Object.entries(r.byName)) renderByName[name] = (renderByName[name] || 0) + n
    }
    const t = analyzeTrace(trace, recorded, TAIL_MS)
    const delta = (k) => (after[k] || 0) - (before[k] || 0)
    const shifts = recorded.shifts.filter((e) => e.t >= recorded.from && !e.hadRecentInput)
    const sources = shifts.flatMap((e) => e.sources)
    const moved = (s) => Math.hypot(s.dx, s.dy)
    const resizes = recorded.resizes.filter((r) => r.t >= recorded.from)
    // How far elements at rest ended up from where they started. Only
    // comparable when the action kept the same elements (flip).
    const sameElements = boxesBefore.length === boxesAfter.length && scenarioName === 'flip'
    const drift = sameElements
      ? boxesBefore.map((a, i) => Math.max(...a.map((v, k) => Math.abs(v - boxesAfter[i][k]))))
      : []
    return {
      metrics: {
        react: {
          commits: recorded.commits.length,
          commitMs: sum(recorded.commits.map((c) => c.actualDuration)),
          maxCommitMs: recorded.commits.length ? Math.max(...recorded.commits.map((c) => c.actualDuration)) : 0,
          renders: sum(recorded.renders.map((r) => r.total)),
          mountedRenders: sum(recorded.renders.map((r) => r.mounted))
        },
        ...t,
        layoutShift: {
          score: sum(shifts.map((e) => e.value)),
          count: shifts.length,
          maxMovePx: Math.max(0, ...sources.map(moved)),
          neighbourMovePx: Math.max(0, ...sources.filter((s) => s.node === '#after' || s.node === '#below').map(moved)),
          resizes: resizes.length,
          maxWidthChangePx: Math.max(0, ...resizes.map((r) => Math.abs(r.dw))),
          maxHeightChangePx: Math.max(0, ...resizes.map((r) => Math.abs(r.dh))),
          ...(geometry && {
            frameMovePx: geometry.maxMovePx,
            frameMovedElements: geometry.movedElements
          }),
          ...(sameElements && {
            restDriftPx: Math.max(0, ...drift),
            restDriftElements: drift.filter((d) => d > 0.01).length
          })
        },
        cdp: {
          layoutCount: delta('LayoutCount'),
          styleRecalcCount: delta('RecalcStyleCount'),
          layoutMs: delta('LayoutDuration') * 1000,
          styleRecalcMs: delta('RecalcStyleDuration') * 1000,
          scriptMs: delta('ScriptDuration') * 1000,
          taskMs: delta('TaskDuration') * 1000
        }
      },
      renderByName,
      capped: settled.capped,
      errors
    }
  } catch (e) {
    // Tracing left on would make every later measurement fail
    if (tracing) await browser.stopTracing().catch(() => {})
    // Page errors usually hold the real cause of a failed step
    throw new Error([e.message.split('\n')[0], ...errors].join('; '))
  } finally {
    await page.close()
  }
}

// Flattens nested metrics to 'group.name' keys
const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v
  }
  return out
}

// A page that can't load or mount the component would fail every
// measurement, so check each target once before starting
for (const target of targets) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    await page.goto(target.pageUrl)
    target.react = await page.evaluate(async (props) => {
      const B = window.__bench
      if (!B || typeof B.mount !== 'function') return null
      B.mount(props)
      await new Promise((resolve) => setTimeout(resolve, 200))
      return B.commits.length && document.getElementById('stage').childElementCount ? B.react : null
    }, { text: TEXTS.short[0], variant: variants[0] })
  } catch (e) {
    errors.unshift(e.message.split('\n')[0])
  } finally {
    await page.close()
  }
  if (!target.react || errors.length) {
    throw new Error(`The test page for ${target.label} did not mount the component: ${errors.join('; ') || 'nothing rendered'}`)
  }
}

for (const target of targets) {
  target.results = {}
  for (const v of variants) {
    target.results[v] = {}
    for (const l of lengths) {
      target.results[v][l] = {}
      for (const s of scenarios) target.results[v][l][s] = { runs: [], renderByName: null, errors: [] }
    }
  }
}

// Runs are interleaved (every cell once, then again), and so are the targets
// within a cell, in rotating order, so drift in the machine spreads across all
// cells and all targets instead of landing on one.
const total = runs * variants.length * lengths.length * scenarios.length * targets.length
let done = 0
const started = Date.now()
const progress = () => {
  const line = `${done}/${total} measurements (${Math.round((Date.now() - started) / 1000)}s)`
  if (process.stdout.isTTY) process.stdout.write(`\r${line}`)
  else if (done % Math.max(1, Math.round(total / 10)) === 0 || done === total) console.log(line)
}
for (let r = 0; r < runs; r++) {
  for (const v of variants) {
    for (const l of lengths) {
      for (const s of scenarios) {
        const shift = r % targets.length
        const order = [...targets.slice(shift), ...targets.slice(0, shift)]
        for (const target of order) {
          const cell = target.results[v][l][s]
          let res
          try {
            res = await measureOnce(target.pageUrl, v, l, s)
          } catch (e) {
            cell.errors.push(`run ${r + 1} failed: ${e.message}`)
            done++
            progress()
            continue
          }
          cell.runs.push(flatten(res.metrics))
          cell.renderByName = cell.renderByName || res.renderByName
          if (res.capped) cell.errors.push(`run ${r + 1}: did not settle within ${CAP_MS}ms`)
          cell.errors.push(...res.errors.map((e) => `run ${r + 1}: ${e}`))
          done++
          progress()
        }
      }
    }
  }
}
if (process.stdout.isTTY) process.stdout.write('\n')

const browserVersion = browser.version()
await browser.close()

const session = randomUUID()
for (const target of targets) {
  // Median and min/max of every metric across runs
  for (const byLength of Object.values(target.results)) {
    for (const byScenario of Object.values(byLength)) {
      for (const cell of Object.values(byScenario)) {
        cell.median = {}
        cell.min = {}
        cell.max = {}
        const keys = new Set(cell.runs.flatMap((run) => Object.keys(run)))
        for (const k of keys) {
          const xs = cell.runs.map((run) => run[k]).filter((x) => typeof x === 'number' && !Number.isNaN(x))
          if (!xs.length) continue
          cell.median[k] = round(median(xs), 3)
          cell.min[k] = round(Math.min(...xs), 3)
          cell.max[k] = round(Math.max(...xs), 3)
        }
        cell.runs = cell.runs.map((run) => Object.fromEntries(Object.entries(run).map(([k, x]) => [k, round(x, 3)])))
      }
    }
  }

  const dir = targets.length === 1 ? outDir : join(outDir, target.label)
  mkdirSync(dir, { recursive: true })
  const meta = {
    label: target.label,
    ref: target.ref,
    commit: target.checkout.sha,
    srcModified: target.checkout.dirty,
    checkout: target.checkout.dir,
    session,
    measuredWith: targets.map((t) => t.label),
    date: new Date().toISOString(),
    runs,
    cpuThrottle: cpu,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height} @2x`,
    react: target.react,
    chromium: browserVersion,
    node: process.version,
    host: `${os.cpus()[0]?.model} x${os.cpus().length}, ${os.platform()} ${os.release()}`,
    texts: Object.fromEntries(lengths.map((l) => [l, TEXTS[l]])),
    scenarios
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  for (const v of variants) {
    writeFileSync(join(dir, `${v}.json`), JSON.stringify({ meta, variant: v, results: target.results[v] }, null, 2) + '\n')
  }
  const summary = summarize(meta, target.results)
  writeFileSync(join(dir, 'summary.md'), summary)
  target.dir = dir
  if (targets.length === 1) console.log('\n' + summary)
}

// A cell with no successful runs has nothing to report or compare
const failed = targets.flatMap((t) =>
  Object.entries(t.results).flatMap(([v, byLength]) =>
    Object.entries(byLength).flatMap(([l, byScenario]) =>
      Object.entries(byScenario)
        .filter(([, cell]) => !cell.runs.length)
        .map(([s, cell]) => `${t.label} ${v} ${l} ${s}: ${cell.errors[0] || 'no runs'}`)
    )
  )
)

// With several targets, compare each one to the first
if (targets.length > 1) {
  const reports = targets.slice(1).map((t) => compareDirs(targets[0].dir, t.dir))
  writeFileSync(join(outDir, 'compare.md'), reports.join('\n'))
  console.log('\n' + reports.join('\n'))
}
console.log(`Results written to ${outDir}`)
if (failed.length) {
  console.error(`\n${failed.length} measurement(s) failed in every run:\n${failed.slice(0, 20).join('\n')}`)
  process.exitCode = 1
}
