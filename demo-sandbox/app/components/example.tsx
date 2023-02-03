'use client'

import styles from './example.module.css'
import { RotatingText } from '~/../dist'
import '~/../dist/index.css'
import { useState, ChangeEvent, useEffect } from 'react'

const MAX_WIDTH = 1000

export function Example() {
  const [text, setText] = useState('HOVERME')
  const [stagger, setStagger] = useState(0.1)
  const [timing, setTiming] = useState('0.5')
  const [fontSize, setFontSize] = useState(60)

  // TODO: ACCOUNT FOR SPACES
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const textLength = text.length
      const projectedWidth = fontSize * textLength
      if (projectedWidth > MAX_WIDTH) {
        const newFontSize = (MAX_WIDTH / textLength) * 0.9
        setFontSize(newFontSize)
      }
    }
  }, [text, fontSize])

  // TODO: INPUT VALIDATION
  const timingParsed = timing.includes(',')
    ? timing.split(',').map((num) => Number(num))
    : Number(timing)

  return (
    <div className={styles.container}>
      <RotatingText
        text={text.length === 0 ? 'HOVERME' : text}
        stagger={stagger || 0.1}
        timing={timingParsed}
        style={{ fontSize }}
      />
      <div className={styles.controls}>
        <div className={styles.control}>
          <label htmlFor='text'>Text</label>
          <p>
            Works best with a single word or short phrase. For longer text,
            consider using multiple Rotating Text components.
          </p>
          <input
            id='text'
            value={text}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setText(event.target.value)
            }}
          />
        </div>
        <div className={styles.control}>
          <label htmlFor='speed'>Stagger</label>
          <p>The time elapsed between each letter. Default is 0.1.</p>
          <input
            id='speed'
            type='number'
            step='0.01'
            min='0.01'
            value={stagger}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setStagger(Number(event.target.value))
            }}
          />
        </div>
        <div className={styles.control}>
          <label htmlFor='timing'>Timing</label>
          <p>
            The duration of each letter animation. Provide a single value or n
            values (n = number of letters) separated by a comma. Default is 0.5.
          </p>
          <input
            id='timing'
            value={timing}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setTiming(event.target.value)
            }}
          />
        </div>
        <div className={styles.control}>
          <label htmlFor='fontsize'>Font Size</label>
          <p>
            This is not a prop, but can be changed by passing a className to the
            component.
          </p>
          <input
            id='fontsize'
            type='number'
            value={fontSize}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setFontSize(Number(event.target.value))
            }}
          />
        </div>
      </div>
    </div>
  )
}
