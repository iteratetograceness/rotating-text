#!/usr/bin/env node
// Compares two result directories written by run.mjs and lists the metrics
// that moved by more than the noise band. See README.md.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { compareDirs } from './lib/compare.mjs'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    band: { type: 'string', default: '0.15' },
    alpha: { type: 'string', default: '0.05' },
    all: { type: 'boolean', default: false }
  }
})
if (positionals.length !== 2) {
  console.log('Usage: npm run compare -- <before dir> <after dir> [--band 0.15] [--alpha 0.05] [--all]')
  process.exit(1)
}
const [before, after] = positionals.map((p) => resolve(p))
console.log(compareDirs(before, after, { band: Number(opts.band), alpha: Number(opts.alpha), all: opts.all }))
