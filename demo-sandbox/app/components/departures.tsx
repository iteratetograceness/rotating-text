'use client'

import { ChangeEvent, memo, useCallback, useEffect, useState } from 'react'
import styles from './departures.module.css'
import { CodeBlock } from './code-block'
import { Flip } from './flip'

type Preset = {
  text: string
  stagger: number
  timing: number | number[]
  feel: string
  status: string
}

const PRESETS: Preset[] = [
  {
    text: 'HOVERME',
    stagger: 0.1,
    timing: 0.5,
    feel: 'The defaults',
    status: 'On time'
  },
  {
    text: 'SNAP',
    stagger: 0.03,
    timing: 0.25,
    feel: 'Quick, for buttons',
    status: 'Early'
  },
  {
    text: 'CASCADE',
    stagger: 0.14,
    timing: 0.6,
    feel: 'A visible wave',
    status: 'On time'
  },
  {
    text: 'DRIFT',
    stagger: 0.22,
    timing: 1.2,
    feel: 'Slow, for headings',
    status: 'Delayed'
  },
  {
    text: 'RIPPLE',
    stagger: 0.06,
    timing: [0.2, 0.4, 0.6, 0.8, 0.6, 0.4],
    feel: 'Per-letter timing array',
    status: 'On time'
  }
]

const DEFAULT_TEXT = 'HOVERME'

const fixed = (n: number) => n.toFixed(2)

const timingLabel = (timing: number | number[]) =>
  Array.isArray(timing)
    ? `${timing[0]} → ${Math.max(...timing)} → ${timing[timing.length - 1]}`
    : fixed(timing)

const timingInput = (timing: number | number[]) =>
  Array.isArray(timing) ? timing.join(', ') : String(timing)

// One positive number, or a comma list of them; null when anything else is typed
export function parseTiming(raw: string): number | number[] | null {
  const parts = raw.split(',').map((part) => part.trim())
  const nums = parts.map(Number)
  const bad = (part: string, n: number) =>
    part === '' || !Number.isFinite(n) || n <= 0
  if (parts.some((part, i) => bad(part, nums[i]))) return null
  return nums.length === 1 ? nums[0] : nums
}

function parseStagger(raw: string): number | null {
  const n = Number(raw)
  return raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

export function snippet(
  text: string,
  stagger: number,
  timing: number | number[],
  size: number
) {
  // JSX attribute strings decode entities, so anything unusual goes in braces
  const textProp = /["\\{}<>&]/.test(text)
    ? `text={${JSON.stringify(text)}}`
    : `text="${text}"`
  const timingProp = Array.isArray(timing)
    ? `timing={[${timing.join(', ')}]}`
    : `timing={${timing}}`

  return `import { RotatingText } from 'rotating-text'
import 'rotating-text/dist/index.css'

function MyApp() {
  return (
    <RotatingText
      ${textProp}
      stagger={${stagger}}
      ${timingProp}
      style={{ fontSize: '${size}px' }}
    />
  )
}`
}

// Kept apart from the playground state so typing there doesn't re-render
// every row on the board
const Board = memo(function Board({
  onTry
}: {
  onTry: (preset: Preset) => void
}) {
  return (
    <section id='departures' className='section'>
      <span className='label'>Examples</span>
      <h2>Departures</h2>
      <p>
        Each row is a preset. Hover a word to run it, or press{' '}
        <strong>Try it</strong> to load its settings into the playground.
      </p>
      <div className={styles.board}>
        <table>
          <thead>
            <tr>
              <th className='label'>Word</th>
              <th className='label'>Stagger</th>
              <th className='label'>Timing</th>
              <th className='label'>Feel</th>
              <th className='label'>Status</th>
              <th>
                <span className='sr-only'>Load into playground</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PRESETS.map((preset) => (
              <tr key={preset.text}>
                <td className={styles.word}>
                  <span className='sr-only'>{preset.text}</span>
                  <Flip
                    text={preset.text}
                    stagger={preset.stagger}
                    timing={preset.timing}
                  />
                </td>
                <td>{fixed(preset.stagger)}</td>
                <td>{timingLabel(preset.timing)}</td>
                <td className={styles.feel}>{preset.feel}</td>
                <td className={styles.status}>{preset.status}</td>
                <td>
                  <button
                    type='button'
                    className={styles.try}
                    onClick={() => onTry(preset)}
                  >
                    Try it
                    <span className='sr-only'> with {preset.text}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
})

export function Departures() {
  const [text, setText] = useState(DEFAULT_TEXT)
  const [staggerRaw, setStaggerRaw] = useState('0.1')
  const [stagger, setStagger] = useState(0.1)
  const [timingRaw, setTimingRaw] = useState('0.5')
  const [timing, setTiming] = useState<number | number[]>(0.5)
  const [size, setSize] = useState(96)

  // Start smaller on phones so the default word fits the preview
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setSize(56)
  }, [])

  const shownText = text.trim() === '' ? DEFAULT_TEXT : text
  const timingValid = parseTiming(timingRaw) !== null
  const staggerValid = parseStagger(staggerRaw) !== null

  const tryPreset = useCallback((preset: Preset) => {
    setText(preset.text)
    setStaggerRaw(String(preset.stagger))
    setStagger(preset.stagger)
    setTimingRaw(timingInput(preset.timing))
    setTiming(preset.timing)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById('playground')
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
    // Keyboard users land on the controls they just loaded
    document.getElementById('pg-text')?.focus({ preventScroll: true })
  }, [])

  return (
    <>
      <Board onTry={tryPreset} />

      <section id='playground' className='section'>
        <span className='label'>Interactive</span>
        <h2>Playground</h2>
        <div className={styles.playground}>
          <div className={styles.stage}>
            <div className={styles.preview}>
              <span className='sr-only'>{shownText}</span>
              <Flip
                text={shownText}
                stagger={stagger}
                timing={timing}
                style={{ fontSize: size }}
              />
            </div>
            <p className={styles.hint}>
              Hover the word. The tiles are this page&apos;s own CSS; the
              component ships plain letters you style with{' '}
              <code>className</code>.
            </p>
          </div>

          <div className={styles.controls}>
            <div className={styles.control}>
              <label htmlFor='pg-text' className='label'>
                Text
              </label>
              <input
                id='pg-text'
                value={text}
                maxLength={24}
                spellCheck={false}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setText(event.target.value)
                }
              />
              <p>
                One word or a short phrase. Spaces collapse and nothing wraps.
              </p>
            </div>
            <div className={styles.control}>
              <label htmlFor='pg-stagger' className='label'>
                Stagger
              </label>
              <input
                id='pg-stagger'
                type='number'
                inputMode='decimal'
                step='0.01'
                min='0'
                value={staggerRaw}
                aria-invalid={!staggerValid}
                aria-describedby='pg-stagger-note'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setStaggerRaw(event.target.value)
                  const parsed = parseStagger(event.target.value)
                  if (parsed !== null) setStagger(parsed)
                }}
              />
              <p
                id='pg-stagger-note'
                className={staggerValid ? '' : styles.error}
              >
                {staggerValid
                  ? 'Seconds between each letter starting. Default 0.1.'
                  : 'Enter a number of seconds, 0 or more.'}
              </p>
            </div>
            <div className={styles.control}>
              <label htmlFor='pg-timing' className='label'>
                Timing
              </label>
              <input
                id='pg-timing'
                value={timingRaw}
                spellCheck={false}
                aria-invalid={!timingValid}
                aria-describedby='pg-timing-note'
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setTimingRaw(event.target.value)
                  const parsed = parseTiming(event.target.value)
                  if (parsed !== null) setTiming(parsed)
                }}
              />
              <p
                id='pg-timing-note'
                className={timingValid ? '' : styles.error}
              >
                {timingValid
                  ? 'Seconds per letter: one number, or one per letter separated by commas. Default 0.5.'
                  : 'Use positive numbers separated by commas, like 0.2, 0.4, 0.6. The preview keeps the last valid timing.'}
              </p>
            </div>
            <div className={styles.control}>
              <label htmlFor='pg-size' className='label'>
                Size <span className='signal'>{size}px</span>
              </label>
              <input
                id='pg-size'
                type='range'
                min='24'
                max='160'
                step='4'
                value={size}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSize(Number(event.target.value))
                }
              />
              <p>
                Not a prop: set it with <code>style</code> or{' '}
                <code>className</code>.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.snippet}>
          <span className='label'>Your snippet</span>
          <CodeBlock
            code={snippet(shownText, stagger, timing, size)}
            what='playground snippet'
            title='MyApp.tsx'
          />
        </div>
      </section>
    </>
  )
}
