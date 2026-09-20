import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

const install = (dir) => {
  // Scripts are skipped so installing doesn't rebuild the committed dist.
  const run = (cmd, args) =>
    execFileSync(cmd, args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' })
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) {
    run('npx', ['-y', 'pnpm@7', 'install', '--frozen-lockfile', '--ignore-scripts'])
  } else if (existsSync(join(dir, 'yarn.lock'))) {
    run('npx', ['-y', 'yarn@1', 'install', '--frozen-lockfile', '--ignore-scripts'])
  } else {
    run('npm', ['install', '--ignore-scripts'])
  }
}

// Returns the directory to measure and what commit it is. With a ref other
// than '.', the commit is checked out into a cached worktree under
// bench/.cache so the working copy is left alone.
export function resolveCheckout({ repo, ref, checkout, cacheDir }) {
  let dir = resolve(checkout || repo)
  if (ref && ref !== '.') {
    const sha = git(repo, 'rev-parse', '--verify', `${ref}^{commit}`)
    dir = join(cacheDir, 'worktrees', sha.slice(0, 12))
    if (!existsSync(dir)) {
      git(repo, 'worktree', 'add', '--detach', dir, sha)
    }
  }
  if (!existsSync(join(dir, 'node_modules', 'react'))) {
    console.log(`Installing dependencies in ${dir}`)
    install(dir)
  }
  const sha = git(dir, 'rev-parse', 'HEAD')
  const dirty = git(dir, 'status', '--porcelain', '--', 'src').length > 0
  return { dir, sha, dirty }
}
