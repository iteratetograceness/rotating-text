'use client'

import { useEffect, useRef, useState } from 'react'

// Older browsers, plain-http previews and frames without clipboard access
function copyWithSelection(text: string) {
  const active = document.activeElement as HTMLElement | null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  active?.focus({ preventScroll: true })
  if (!ok) throw new Error('Copy failed')
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    copyWithSelection(text)
  }
}

export function CopyButton({ text, what }: { text: string; what: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    window.clearTimeout(timer.current)
    // Clear first so a repeat copy is announced again
    setState('idle')
    try {
      await writeClipboard(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = window.setTimeout(() => setState('idle'), 1500)
  }

  return (
    <>
      <button type='button' className='copy' onClick={copy}>
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}
        <span className='sr-only'> {what}</span>
      </button>
      <span className='sr-only' aria-live='polite'>
        {state === 'copied'
          ? `Copied ${what} to the clipboard`
          : state === 'failed'
          ? `Couldn't copy the ${what}`
          : ''}
      </span>
    </>
  )
}
