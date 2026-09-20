// Loaded before React. Everything the Node side reads lives on
// window.__bench. It stays cheap on purpose: it runs inside the frames being
// measured.
;(function () {
  const B = (window.__bench = {
    commits: [], // React Profiler onRender calls
    renders: [], // per-commit component render counts from the fiber tree
    frames: [], // requestAnimationFrame timestamps
    shifts: [], // layout-shift entries
    resizes: [], // size changes of the element holding the component
    recording: false,
    trigger: 0
  })

  B.reset = () => {
    B.commits = []
    B.renders = []
    B.frames = []
    B.shifts = []
    B.resizes = []
    B.trigger = 0
  }

  // --- Frames ---------------------------------------------------------------
  const tick = (t) => {
    if (!B.recording) return
    B.frames.push(t)
    requestAnimationFrame(tick)
  }
  B.startFrames = () => {
    B.recording = true
    requestAnimationFrame(tick)
  }
  B.stopFrames = () => {
    B.recording = false
  }

  // --- Layout shift ---------------------------------------------------------
  // Chromium's layout-shift entries (what CLS adds up), with how far each
  // shifted element moved, and every size change of #stage, which wraps the
  // component. Neither observer costs anything unless something moves.
  const describe = (node) =>
    !node || node.nodeType !== 1
      ? 'text'
      : node.id
        ? `#${node.id}`
        : `${node.tagName.toLowerCase()}${node.classList.length ? '.' + node.classList[0] : ''}`
  new PerformanceObserver((list) => {
    if (!B.recording) return
    for (const e of list.getEntries()) {
      B.shifts.push({
        t: e.startTime,
        value: e.value,
        hadRecentInput: e.hadRecentInput,
        sources: (e.sources || []).map((s) => ({
          node: describe(s.node),
          dx: s.currentRect.x - s.previousRect.x,
          dy: s.currentRect.y - s.previousRect.y,
          dw: s.currentRect.width - s.previousRect.width,
          dh: s.currentRect.height - s.previousRect.height
        }))
      })
    }
  }).observe({ type: 'layout-shift' })
  let lastSize = null
  const sizeObserver = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    if (B.recording && lastSize) {
      B.resizes.push({ t: performance.now(), dw: width - lastSize.width, dh: height - lastSize.height })
    }
    lastSize = { width, height }
  })
  document.addEventListener('DOMContentLoaded', () => sizeObserver.observe(document.getElementById('stage')))

  // Boxes of the visible elements on the line and below it, as drawn
  // (transforms included), sorted by position. Read once before the action and
  // once after it settles, outside the measured window, to see whether what's
  // on screen comes to rest somewhere new. Elements faded out (a roll letter's
  // hidden face) are left out, so a face swap that lands exactly counts as no
  // drift.
  const visible = (el) => {
    for (let e = el; e && e.id !== 'line'; e = e.parentElement) {
      const style = getComputedStyle(e)
      if (Number(style.opacity) < 0.01 || style.visibility === 'hidden') return false
    }
    return true
  }
  B.boxes = () =>
    [...document.querySelectorAll('#line *, #below')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return [r.x, r.y, r.width, r.height]
      })
      .filter(([, , w, h]) => w * h > 0.5)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])

  // Layout boxes (position and size before transforms) of everything on the
  // line and below it, checked on every frame against where each element was
  // before the action. Rotating a letter doesn't move its layout box; a tile
  // that changes width, or text pushed along, does. Reading layout every frame
  // forces work, so this runs in its own untimed pass after the measurement.
  const layoutBox = (el) => {
    let x = 0
    let y = 0
    for (let e = el; e; e = e.offsetParent) {
      x += e.offsetLeft
      y += e.offsetTop
    }
    return [x, y, el.offsetWidth, el.offsetHeight]
  }
  const layoutElements = () => [...document.querySelectorAll('#line *, #below')].filter((el) => el instanceof HTMLElement)
  B.startGeometry = () => {
    const rest = new Map(layoutElements().map((el) => [el, layoutBox(el)]))
    const geo = (B.geometry = { on: true, maxMovePx: 0, moved: new Set(), frames: 0 })
    const sample = () => {
      if (!geo.on) return
      geo.frames++
      for (const el of layoutElements()) {
        const before = rest.get(el)
        if (!before) continue
        const box = layoutBox(el)
        const d = Math.max(...box.map((v, i) => Math.abs(v - before[i])))
        if (d > 0.5) geo.moved.add(el)
        geo.maxMovePx = Math.max(geo.maxMovePx, d)
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }
  B.stopGeometry = () => {
    const geo = B.geometry
    geo.on = false
    return { maxMovePx: geo.maxMovePx, movedElements: geo.moved.size, frames: geo.frames }
  }

  // --- Settling ---------------------------------------------------------------
  // The transition is over once nothing under the stage has changed for
  // `quietMs` and no Web Animation is running. This follows whatever timing
  // the component uses, so the harness needs no knowledge of its defaults.
  // It polls a snapshot of the markup rather than observing mutations, so its
  // cost doesn't grow with how many changes the component makes. The exact end
  // of the transition is read from the trace afterwards.
  const snapshot = () => document.getElementById('stage').innerHTML
  const running = () =>
    document.getAnimations().some((a) => a.playState === 'running')
  B.waitSettled = (quietMs, capMs) =>
    new Promise((resolve) => {
      const start = performance.now()
      let last = snapshot()
      let changed = Math.max(B.trigger, start)
      const check = () => {
        const now = performance.now()
        const current = snapshot()
        if (current !== last || running()) {
          last = current
          changed = now
        }
        if (now - changed >= quietMs || now - start > capMs) {
          resolve({ capped: now - start > capMs })
        } else {
          setTimeout(check, 50)
        }
      }
      setTimeout(check, 50)
    })

  // --- Component renders -----------------------------------------------------
  // A minimal React DevTools hook. After each commit it walks the subtree
  // under <Profiler id="rt"> and counts the components that rendered: a fiber
  // that is a new object since the last commit was visited, and one with the
  // PerformedWork flag actually ran (rather than bailing out).
  const PERFORMED_WORK = 1
  const COMPONENT_TAGS = new Set([0, 1, 2, 11, 14, 15]) // function, class, indeterminate, forwardRef, memo, simple memo
  const PROFILER_TAG = 12
  let previous = new Set()

  const nameOf = (fiber) => {
    let type = fiber.type
    if (!type) return 'Anonymous'
    if (type.type) type = type.type // memo
    if (type.render) type = type.render // forwardRef
    return type.displayName || type.name || 'Anonymous'
  }

  const findProfiler = (fiber) => {
    const stack = [fiber]
    while (stack.length) {
      const f = stack.pop()
      if (!f) continue
      if (f.tag === PROFILER_TAG && f.memoizedProps && f.memoizedProps.id === 'rt') return f
      if (f.sibling) stack.push(f.sibling)
      if (f.child) stack.push(f.child)
    }
    return null
  }

  const onCommit = (root) => {
    const profiler = findProfiler(root.current)
    if (!profiler) return
    const seen = new Set()
    const byName = {}
    let total = 0
    let mounted = 0
    const stack = [profiler.child]
    while (stack.length) {
      const f = stack.pop()
      if (!f) continue
      seen.add(f)
      if (!previous.has(f) && COMPONENT_TAGS.has(f.tag)) {
        const flags = f.flags !== undefined ? f.flags : f.effectTag
        if (flags & PERFORMED_WORK) {
          total++
          if (f.alternate === null) mounted++
          const name = nameOf(f)
          byName[name] = (byName[name] || 0) + 1
        }
      }
      if (f.sibling) stack.push(f.sibling)
      if (f.child) stack.push(f.child)
    }
    previous = seen
    B.renders.push({ t: performance.now(), total, mounted, byName })
  }

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      const id = this.renderers.size + 1
      this.renderers.set(id, renderer)
      return id
    },
    onCommitFiberRoot(_id, root) {
      try {
        onCommit(root)
      } catch (e) {
        B.hookError = String(e)
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {}
  }
})()
