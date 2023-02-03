import styles from './page.module.css'
import { Example } from './components/example'

export default function Home() {
  return (
    <main className={styles.main}>
      <h1>Rotating Text Demo</h1>
      <div className={styles.note}>
        Welcome to the Rotating Text Demo! Update the text, speed, and timing to
        update the example below.
      </div>
      <div className={styles.content}>
        <Example />
      </div>
    </main>
  )
}
