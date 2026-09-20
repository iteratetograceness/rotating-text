export const sum = (xs) => xs.reduce((a, b) => a + b, 0)

export const quantile = (xs, q) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export const median = (xs) => quantile(xs, 0.5)

export const round = (x, digits = 2) => {
  const f = 10 ** digits
  return Math.round(x * f) / f
}

// Two-sided Mann-Whitney U test: the chance of seeing samples this far apart
// if both came from the same distribution. Exact for the small sample sizes
// the harness uses (ties get midranks, which makes it slightly conservative).
export const mannWhitneyP = (xs, ys) => {
  const n = xs.length
  const m = ys.length
  if (!n || !m) return 1
  const all = [...xs.map((v) => [v, 0]), ...ys.map((v) => [v, 1])].sort((a, b) => a[0] - b[0])
  const ranks = new Array(all.length)
  for (let i = 0; i < all.length; ) {
    let j = i
    while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++
    for (let k = i; k <= j; k++) ranks[k] = (i + j) / 2 + 1
    i = j + 1
  }
  const rx = sum(all.map((e, i) => (e[1] === 0 ? ranks[i] : 0)))
  const ux = rx - (n * (n + 1)) / 2
  const u = Math.min(ux, n * m - ux)
  const dist = uDistribution(n, m)
  const totalWays = sum(dist.map((c) => c || 0))
  let tail = 0
  for (let s = 0; s < dist.length; s++) if (s <= u) tail += dist[s] || 0
  return Math.min(1, (2 * tail) / totalWays)
}

// The smallest two-sided p the test can give with n and m samples: every
// value on one side beyond every value on the other.
export const minMannWhitneyP = (n, m) => {
  if (!n || !m) return 1
  const dist = uDistribution(n, m)
  return Math.min(1, (2 * dist[0]) / sum(dist.map((c) => c || 0)))
}

// Number of arrangements of n x-values and m y-values giving each U, where U
// counts the (x, y) pairs with x > y. Depends only on n and m, so it's cached.
const distributions = new Map()
const uDistribution = (n, m) => {
  const key = `${n},${m}`
  if (distributions.has(key)) return distributions.get(key)
  // counts[k][u]: arrangements of k x-values among the first j values with statistic u
  let counts = Array.from({ length: n + 1 }, (_, k) => (k === 0 ? [1] : []))
  for (let j = 1; j <= n + m; j++) {
    const next = Array.from({ length: n + 1 }, () => [])
    for (let k = 0; k <= Math.min(j, n); k++) {
      const ys = j - k // y-values placed so far
      if (ys > m) continue
      const row = next[k]
      // last value is a y: no change to U
      for (const [s, c] of (counts[k] || []).entries()) if (c) row[s] = (row[s] || 0) + c
      // last value is an x: it beats every y placed so far
      if (k > 0) for (const [s, c] of (counts[k - 1] || []).entries()) if (c) row[s + ys] = (row[s + ys] || 0) + c
    }
    counts = next
  }
  distributions.set(key, counts[n])
  return counts[n]
}
