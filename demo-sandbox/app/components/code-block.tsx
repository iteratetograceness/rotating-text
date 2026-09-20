'use client'

import { Light as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/cjs/languages/hljs/bash'
import javascript from 'react-syntax-highlighter/dist/cjs/languages/hljs/javascript'
import xml from 'react-syntax-highlighter/dist/cjs/languages/hljs/xml'
import { CopyButton } from './copy-button'

// Only the grammars the page uses, not every highlight.js language. JSX
// inside JavaScript is highlighted with xml, so it has to be registered too.
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('xml', xml)

// Highlighting from the board tokens, so it follows the light and dark themes
const boardStyle: { [key: string]: React.CSSProperties } = {
  hljs: {
    display: 'block',
    overflowX: 'auto',
    padding: '18px 20px',
    background: 'var(--flap)',
    color: 'var(--ink)'
  },
  'hljs-keyword': { color: 'var(--dim)' },
  'hljs-built_in': { color: 'var(--dim)' },
  'hljs-comment': { color: 'var(--dim)', fontStyle: 'italic' },
  'hljs-meta': { color: 'var(--dim)' },
  'hljs-name': { fontWeight: 500 },
  'hljs-title': { fontWeight: 500 },
  'hljs-string': { color: 'var(--signal)' },
  'hljs-number': { color: 'var(--signal)' },
  'hljs-literal': { color: 'var(--signal)' }
}

export function CodeBlock({
  code,
  what,
  title,
  language = 'javascript'
}: {
  code: string
  what: string
  title: string
  language?: string
}) {
  return (
    <div className='code'>
      <div className='code-head'>
        <span className='label'>{title}</span>
        <CopyButton text={code} what={what} />
      </div>
      <SyntaxHighlighter
        language={language}
        style={boardStyle}
        codeTagProps={{ style: { fontFamily: 'var(--mono)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
