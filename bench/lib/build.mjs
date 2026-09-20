import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pageDir = join(here, '..', 'page')

// Bundles the checkout's src/index.tsx into a page the runner can open from
// disk. Returns the page's file path.
export async function buildPage(checkout, outDir) {
  mkdirSync(outDir, { recursive: true })
  const req = createRequire(join(checkout, 'package.json'))
  const resolveIn = (id) => {
    try {
      return req.resolve(id)
    } catch {
      return null
    }
  }

  const source = ['src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js']
    .map((p) => join(checkout, p))
    .find(existsSync)
  if (!source) throw new Error(`No src/index.* in ${checkout}`)

  const reactDom = resolveIn('react-dom/profiling') || resolveIn('react-dom')
  if (!resolveIn('react') || !reactDom) {
    throw new Error(`react and react-dom are not installed in ${checkout}`)
  }
  // React 16 and 17's profiling build needs scheduler's matching tracing
  // build. scheduler is react-dom's dependency, so look for it from there
  // (pnpm doesn't hoist it to the top of node_modules).
  const fromReactDom = createRequire(reactDom)
  const schedulerTracing = ['scheduler/tracing-profiling', 'scheduler/tracing']
    .map((id) => {
      try {
        return fromReactDom.resolve(id)
      } catch {
        return null
      }
    })
    .find(Boolean)

  // One copy of React for the page and the component, taken from the
  // checkout, with react-dom swapped for its profiling build.
  const redirects = {
    'rotating-text-under-test': source,
    react: resolveIn('react'),
    'react/jsx-runtime': resolveIn('react/jsx-runtime'),
    'react-dom': reactDom,
    'react-dom/client': reactDom,
    'scheduler/tracing': schedulerTracing
  }
  const underTest = {
    name: 'under-test',
    setup(b) {
      b.onResolve({ filter: /^(rotating-text-under-test|react|react\/jsx-runtime|react-dom|react-dom\/client|scheduler\/tracing)$/ }, (args) =>
        redirects[args.path] ? { path: redirects[args.path] } : undefined
      )
    }
  }

  await build({
    entryPoints: { entry: join(pageDir, 'entry.jsx') },
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    keepNames: true, // component names show up in the render counts
    define: { 'process.env.NODE_ENV': '"production"' },
    nodePaths: [join(checkout, 'node_modules')],
    loader: { '.module.css': 'local-css', '.css': 'css' },
    plugins: [underTest],
    // entry.jsx falls back to a default export for older commits
    logOverride: { 'import-is-undefined': 'silent' },
    logLevel: 'warning'
  })

  copyFileSync(join(pageDir, 'runtime.js'), join(outDir, 'runtime.js'))
  const css = existsSync(join(outDir, 'entry.css')) ? '<link rel="stylesheet" href="entry.css">' : ''
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${css}
<style>
  html, body { margin: 0; background: #fff; color: #111; }
  body { font: 600 56px/1.2 "DejaVu Sans", Arial, sans-serif; }
  /* The component sits inside a line of text, with a paragraph below, so a
     change in its size shows up as other content moving (layout shift). */
  #line { display: flex; align-items: flex-start; margin: 120px 0 0 80px; }
  #below { margin: 24px 0 0 80px; font-size: 24px; font-weight: 400; }
</style>
</head>
<body>
<div id="line"><span id="before">Go&nbsp;</span><div id="stage"></div><span id="after">&nbsp;now</span></div>
<p id="below">A line of text below the component.</p>
<script src="runtime.js"></script>
<script src="entry.js"></script>
</body>
</html>
`
  const page = join(outDir, 'index.html')
  writeFileSync(page, html)
  return page
}
