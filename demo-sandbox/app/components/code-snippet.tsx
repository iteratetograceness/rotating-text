'use client'

import SyntaxHighlighter from 'react-syntax-highlighter'
import { tomorrowNightBlue } from 'react-syntax-highlighter/dist/esm/styles/hljs'

export const CodeSnippet = ({ code }: { code: string }) => {
  return (
    <SyntaxHighlighter
      language='javascript'
      style={tomorrowNightBlue}
      customStyle={{ padding: '30px' }}
    >
      {code}
    </SyntaxHighlighter>
  )
}
