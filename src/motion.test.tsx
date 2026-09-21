import * as React from 'react'
import * as framer from 'framer-motion'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as motion from './motion'

// ./motion is a port of the parts of framer-motion 9 the component uses. These
// run the same animations through both, on the same fake clock, and expect
// every frame to match framer's to the last bit.

type Library = typeof motion | typeof framer

// requestAnimationFrame on a clock the test moves along
let queue: FrameRequestCallback[] = []
let clock = 1000
beforeEach(() => {
  queue = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    queue.push(callback)
    return queue.length
  })
})
// Frames still asked for run out, so both frame loops are idle for the next
// test even when this one failed part way
afterEach(() => {
  cleanup()
  for (let i = 0; queue.length && i < 5000; i++) {
    clock += 1000 / 60
    const callbacks = queue
    queue = []
    callbacks.forEach((callback) => callback(clock))
  }
  vi.restoreAllMocks()
})

// Runs frames `gaps` ms apart until nothing asks for another, letting
// promises settle between frames as a browser would
const runFrames = async (gaps: (frame: number) => number) => {
  for (let i = 0; queue.length && i < 2000; i++) {
    clock += gaps(i)
    const callbacks = queue
    queue = []
    callbacks.forEach((callback) => callback(clock))
    await Promise.resolve()
    await Promise.resolve()
  }
  expect(queue).toHaveLength(0)
}

const sixty = () => 1000 / 60
// Uneven frames, some past the 40 ms a frame is capped at
const uneven = (i: number) => [16.7, 8, 33.4, 50, 16.6, 1, 0.5, 70][i % 8]

// Every event an animation reports, in order, with the frame it came in
const record = async (
  lib: Library,
  gaps: (frame: number) => number,
  script: (log: (...event: unknown[]) => void, lib: Library) => void
) => {
  // Each library starts from the same time, so both see the same gaps
  // between frames down to the last bit
  clock = 1000
  const events: unknown[][] = []
  let frame = 0
  const log = (...event: unknown[]) => events.push([frame, ...event])
  script(log, lib)
  const counted = (i: number) => {
    frame = i + 1
    return gaps(i)
  }
  await runFrames(counted)
  return events
}

const same = async (
  gaps: (frame: number) => number,
  script: (log: (...event: unknown[]) => void, lib: Library) => void
) => {
  const theirs = await record(framer, gaps, script)
  const ours = await record(motion, gaps, script)
  expect(theirs.length).toBeGreaterThan(3)
  expect(ours).toEqual(theirs)
}

// The springs the component uses: the roll's (see rollSpring in index.tsx),
// the width's (widthSpring) and framer's default for scale
const rollSpring = (seconds: number) => {
  const decay = Math.log(90 / 0.5 / Math.sqrt(1 - 0.65 ** 2)) / seconds
  const frequency = decay / 0.65
  return {
    type: 'spring' as const,
    stiffness: frequency ** 2,
    damping: 2 * decay,
    mass: 1,
    velocity: 0,
    restDelta: 0.5,
    restSpeed: frequency * 0.5
  }
}
const criticalSpring = (seconds: number, velocity: number) => {
  const stiffness = (7.5 / seconds) ** 2
  return {
    type: 'spring' as const,
    stiffness,
    damping: 2 * Math.sqrt(stiffness),
    mass: 1,
    velocity,
    restDelta: 0.1
  }
}
const scaleSpring = {
  type: 'spring' as const,
  stiffness: 550,
  damping: 30,
  restSpeed: 10
}
const fallEase = (t: number) => 0.25 * t + 0.75 * t * t
const bounce = (t: number) => Math.sin(Math.PI * t) * (1 - t)

describe('motion', () => {
  for (const [name, gaps] of [
    ['at 60fps', sixty],
    ['on uneven frames', uneven]
  ] as const) {
    describe(name, () => {
      it('turns a roll letter on the same spring, with a delay', () =>
        same(gaps, (log, lib) => {
          for (const [seconds, delay] of [
            [0.5, 0],
            [0.3, 0.1],
            [0.01, 0.25],
            [1.2, 0.05]
          ]) {
            const angle = lib.motionValue(0)
            angle.on('change', (v) => log('change', seconds, v))
            lib.animate(angle, -90, {
              ...rollSpring(seconds),
              delay,
              onComplete: () => log('complete', seconds, angle.isAnimating()),
              onStop: () => log('stop', seconds)
            })
          }
        }))

      it('eases a width, then carries its speed into a new target', () =>
        same(gaps, (log, lib) => {
          const width = lib.motionValue(20)
          let changed = false
          lib.animate(width, 180, {
            ...criticalSpring(0.5, 0),
            onUpdate: (v) => {
              log('update', v, width.getVelocity())
              if (changed || v < 90) return
              changed = true
              const velocity = width.getVelocity()
              lib.animate(width, 40, {
                ...criticalSpring(0.4, velocity),
                onUpdate: (w) => log('second', w, width.getVelocity()),
                onComplete: () => log('second done')
              })
            },
            onComplete: () => log('first done'),
            onStop: () => log('first stopped')
          })
        }))

      it('drops a flap and lets it bounce, on the same tweens', () =>
        same(gaps, (log, lib) => {
          lib.animate(0, -180, {
            duration: 0.4,
            delay: 0.1,
            ease: fallEase,
            onUpdate: (v) => log('fall', v),
            onComplete: () =>
              lib.animate(-180, -160, {
                duration: 0.2,
                ease: bounce,
                onUpdate: (v) => log('settle', v),
                onComplete: () => log('rest')
              })
          })
          lib.animate(0, -180, {
            duration: 0,
            ease: fallEase,
            onUpdate: (v) => log('instant', v),
            onComplete: () => log('instant done')
          })
        }))

      it('scales on hover and back mid-way, on the spring framer gives scale', () =>
        same(gaps, (log, lib) => {
          const scale = lib.motionValue(1)
          let left = false
          lib.animate(scale, 1.05, {
            ...scaleSpring,
            onUpdate: (v) => {
              log('in', v)
              if (left || v < 1.03) return
              left = true
              lib.animate(scale, 1, {
                ...scaleSpring,
                onUpdate: (w) => log('out', w),
                onComplete: () => log('out done')
              })
            }
          })
        }))
    })
  }

  it('reports a turn stopped when it is jumped to rest as it completes', () =>
    same(sixty, (log, lib) => {
      const angle = lib.motionValue(0)
      angle.on('change', (v) => log('change', v))
      lib.animate(angle, -90, {
        ...rollSpring(0.2),
        onComplete: () => {
          log('complete', angle.isAnimating())
          angle.jump(0)
          log('jumped', angle.get(), angle.isAnimating())
        },
        onStop: () => log('stop')
      })
    }))

  it('stops the animation on a value once nothing listens to it', () =>
    same(sixty, (log, lib) => {
      const angle = lib.motionValue(0)
      const off = angle.on('change', (v) => {
        log('change', v)
        if (v < -45) off()
      })
      lib.animate(angle, -90, {
        ...rollSpring(0.5),
        onUpdate: (v) => log('update', v),
        onStop: () => log('stop')
      })
    }))

  it('scales on hover as motion.div does with whileHover', async () => {
    // jsdom has no PointerEvent, so a mouse event stands in for one
    const pointer = (
      el: Element,
      type: 'pointerenter' | 'pointerleave',
      { pointerType = 'mouse', button = 0, isPrimary = true } = {}
    ) => {
      const event = new MouseEvent(type, { button })
      Object.defineProperties(event, {
        pointerType: { value: pointerType },
        isPrimary: { value: isPrimary }
      })
      act(() => {
        el.dispatchEvent(event)
      })
    }
    // What each element does, frame by frame, as the pointer comes and goes
    const drive = async (el: Element, started: () => number) => {
      clock = 1000
      const seen: [string, string, number][] = []
      const frames = async (label: string, n: number) => {
        for (let i = 0; i < n; i++) {
          clock += 1000 / 60
          const callbacks = queue
          queue = []
          callbacks.forEach((callback) => callback(clock))
          await Promise.resolve()
          seen.push([label, (el as HTMLElement).style.transform, started()])
        }
      }
      pointer(el, 'pointerleave')
      await frames('leave with no enter', 3)
      pointer(el, 'pointerenter')
      await frames('enter', 8)
      pointer(el, 'pointerleave')
      await frames('leave mid-way', 40)
      pointer(el, 'pointerenter', { button: 2 })
      await frames('right button', 3)
      pointer(el, 'pointerenter', { pointerType: 'touch', isPrimary: false })
      await frames('second finger', 3)
      pointer(el, 'pointerenter', { pointerType: 'touch' })
      await frames('tap', 40)
      pointer(el, 'pointerenter')
      await frames('enter again', 5)
      pointer(el, 'pointerleave')
      await frames('leave', 40)
      return seen
    }

    let theirStarts = 0
    const theirs = render(
      <framer.motion.div
        whileHover={{ scale: 1.05 }}
        onHoverStart={() => theirStarts++}
      />
    )
    const framerFrames = await drive(
      theirs.container.firstElementChild!,
      () => theirStarts
    )
    theirs.unmount()

    let ourStarts = 0
    const Ours = () => {
      const ref = React.useRef<HTMLDivElement>(null)
      motion.useHover(ref, () => ourStarts++, 1.05)
      return <div ref={ref} />
    }
    const ours = render(<Ours />)
    const ourFrames = await drive(
      ours.container.firstElementChild!,
      () => ourStarts
    )

    expect(framerFrames.some(([, t]) => t.startsWith('scale(1.04'))).toBe(true)
    expect(framerFrames[framerFrames.length - 1][1]).toBe('none')
    expect(ourFrames).toEqual(framerFrames)
  })

  it('maps numbers between ranges as transform in framer does', () => {
    const input = [-85, -60, 0, 60, 85]
    const output = [0, 0.75, 1, 0.75, 0]
    const ours = motion.transform(input, output)
    const theirs = framer.transform(input, output)
    for (let angle = -200; angle <= 200; angle += 0.37) {
      expect(ours(angle)).toBe(theirs(angle))
    }
    expect(motion.clamp(0, 1, 1.5)).toBe(framer.clamp(0, 1, 1.5))
  })
})
