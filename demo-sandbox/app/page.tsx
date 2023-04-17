import styles from './page.module.css'
import { Example } from './components/example'
import { CodeSnippet } from './components/code-snippet'

const CODE_SNIPPET = `import React from 'react'

import { RotatingText } from 'rotating-text'
import 'rotating-text/dist/index.css'

function MyApp {
  return (
    <RotatingText
      text="HOVERME"
      stagger={0.1}
      timing={0.5}
      className="rotating-text"
      styles={{ fontSize: '100px' }}
    />
  )
}`

export default function Home() {
  return (
    <main className={styles.main}>
      <h1>Rotating Text Demo</h1>
      <div className={styles.note}>
        Welcome to the Rotating Text Demo! Update the text, speed, and timing to
        update the example below. Scroll down to see how to get started or visit{' '}
        <a href='https://github.com/jueungrace/rotating-text'>here</a>.
      </div>
      <div className={styles.content}>
        <Example />
      </div>
      <div className={styles.readme}>
        <h2>Getting Started</h2>
        <CodeSnippet code='npm install rotating-text' />
        <p>
          You have control over the <code>text</code> content,{' '}
          <code>stagger</code> (time between each letter), <code>timing</code>{' '}
          (duration of each letter animation), and any style customizations
          through <code>className</code> and <code>styles</code>.
        </p>
        <CodeSnippet code={CODE_SNIPPET} />
        <p>Note: Text wrapping is currently not supported.</p>
      </div>
    </main>
  )
}
