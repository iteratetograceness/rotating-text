// Bundled against the checkout under test: `react`, `react-dom` and
// `framer-motion` resolve from its node_modules, and `rotating-text-under-test`
// is its src/index.tsx. react-dom is swapped for its profiling build so the
// Profiler reports timings in an otherwise production bundle.
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Component from 'rotating-text-under-test'

const RotatingText = Component.RotatingText || Component.default
const B = window.__bench

const onRender = (_id, phase, actualDuration, baseDuration, startTime, commitTime) => {
  B.commits.push({ phase, actualDuration, baseDuration, startTime, commitTime })
}

let setProps = null

const App = ({ initial }) => {
  const [props, set] = React.useState(initial)
  setProps = set
  return (
    <React.Profiler id='rt' onRender={onRender}>
      <RotatingText {...props} />
    </React.Profiler>
  )
}

B.mount = (props) => {
  const stage = document.getElementById('stage')
  const app = <App initial={props} />
  if (ReactDOM.createRoot) ReactDOM.createRoot(stage).render(app)
  else ReactDOM.render(app, stage)
}

B.setProps = (next) => setProps((props) => ({ ...props, ...next }))

B.react = React.version
