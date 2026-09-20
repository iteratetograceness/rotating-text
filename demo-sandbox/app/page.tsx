import styles from './page.module.css'
import pkg from '../../package.json'
import { Clock } from './components/clock'
import { CodeBlock } from './components/code-block'
import { CopyButton } from './components/copy-button'
import { Departures } from './components/departures'
import { Flip } from './components/flip'

const GITHUB_URL = 'https://github.com/iteratetograceness/rotating-text'
const NPM_URL = 'https://www.npmjs.com/package/rotating-text'

const INSTALL = 'npm install rotating-text'

// The README's usage example, verbatim
const USAGE = `import React from 'react'

import { RotatingText } from 'rotating-text'
import 'rotating-text/dist/index.css'

function MyApp() {
  return (
    <RotatingText
      text="HOVERME"
      stagger={0.1}
      timing={0.5}
      className="rotating-text"
      style={{ fontSize: '100px' }}
    />
  )
}`

const PROPS = [
  {
    name: 'text',
    type: 'string',
    value: '(required)',
    about: 'Text to animate.'
  },
  {
    name: 'stagger',
    type: 'number',
    value: '0.1',
    about: 'Seconds between each letter starting its animation.'
  },
  {
    name: 'timing',
    type: 'number | number[]',
    value: '0.5',
    about: "Seconds each letter's animation lasts, or one duration per letter."
  },
  {
    name: 'className',
    type: 'string',
    value: 'undefined',
    about: 'Class name added to the outer container.'
  },
  {
    name: 'style',
    type: 'React.CSSProperties',
    value: 'undefined',
    about: 'Inline styles applied to the outer container.'
  }
]

export default function Home() {
  return (
    <div className={styles.wrap}>
      <header className={styles.strip}>
        <span className={`label ${styles.brand}`}>
          <span>Rotating Text</span>
          <span className='signal'>v{pkg.version}</span>
        </span>
        <nav className='label' aria-label='Project links'>
          <a href={GITHUB_URL}>GitHub</a>
          <a href={NPM_URL}>npm</a>
        </nav>
        <Clock className={styles.clock} />
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>
            <span className='label'>Now flipping</span>
            <span className='label'>React 18, Framer Motion, MIT</span>
          </div>
          <h1 className={styles.heroWords}>
            <span className='sr-only'>Rotating Text</span>
            <Flip text='Rotating' stagger={0.07} />
            <Flip text='Text' />
          </h1>
          <p className={styles.lede}>
            A 3D flip-on-hover text component for React, built with Framer
            Motion. Hover the name.
          </p>
          <p className={styles.hint}>
            <span className={styles.hoverHint}>
              Every tiled word on this page is the component, running.
            </span>
            <span className={styles.touchHint}>
              Open on a desktop and hover the name to see it flip.
            </span>
          </p>
          <div className={styles.install}>
            <span>
              <span className='signal'>$</span> {INSTALL}
            </span>
            <CopyButton text={INSTALL} what='install command' />
          </div>
        </section>

        <Departures />

        <section id='install' className='section'>
          <span className='label'>Getting started</span>
          <h2>Install and use</h2>
          <ol className={styles.steps}>
            <li>
              <h3>Install the package</h3>
              <CodeBlock
                code={INSTALL}
                what='install command'
                title='Terminal'
                language='bash'
              />
            </li>
            <li>
              <h3>Import the component and its CSS</h3>
              <CodeBlock code={USAGE} what='usage example' title='MyApp.tsx' />
            </li>
          </ol>
          <p className={styles.peer}>
            Peer dependency: React 18. Framer Motion is bundled.
          </p>
        </section>

        <section id='props' className='section'>
          <span className='label'>Reference</span>
          <h2>Props</h2>
          <div className={styles.props}>
            <table>
              <thead>
                <tr>
                  <th className='label'>Prop</th>
                  <th className='label'>Type</th>
                  <th className='label'>Default</th>
                  <th className='label'>Description</th>
                </tr>
              </thead>
              <tbody>
                {PROPS.map((prop) => (
                  <tr key={prop.name}>
                    <td>{prop.name}</td>
                    <td>{prop.type}</td>
                    <td className={styles.default}>{prop.value}</td>
                    <td>{prop.about}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id='notes' className='section'>
          <span className='label'>Before you ship</span>
          <h2>Notes</h2>
          <ul className={styles.notes}>
            <li>
              Works best with one word or a short phrase. Text does not wrap,
              and spaces collapse, so use one component per word.
            </li>
            <li>
              The flip runs on hover, so touch screens see the text standing
              still.
            </li>
            <li>
              With reduced motion turned on, the flip becomes a gentle scale.
            </li>
          </ul>
        </section>
      </main>

      <footer className={styles.end}>
        <div className={styles.endWords}>
          <span className='sr-only'>End of service</span>
          <Flip text='End' stagger={0.05} timing={0.4} tiles={false} />
          <Flip text='of' stagger={0.05} timing={0.4} tiles={false} />
          <Flip text='service' stagger={0.05} timing={0.4} tiles={false} />
        </div>
        <div className={styles.endLinks}>
          <span>
            © <a href='https://joonie.dev'>Jueun Grace Yun</a>
          </span>
          <a href={GITHUB_URL}>GitHub</a>
          <a href={NPM_URL}>npm</a>
          <span>MIT</span>
        </div>
      </footer>
    </div>
  )
}
