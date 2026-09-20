'use client'

import { useEffect, useState } from 'react'

const pad = (n: number) => String(n).padStart(2, '0')

// Rendered after mount so the server HTML never disagrees with the reader's time
export function Clock({ className }: { className?: string }) {
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow(`${pad(d.getHours())}:${pad(d.getMinutes())}`)
    }
    tick()
    // Every second, so the minute turns over on time; same text skips a render
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span className={className} aria-label='Local time'>
      {now ?? '--:--'}
    </span>
  )
}
