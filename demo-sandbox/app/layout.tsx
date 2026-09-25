import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import { AnalyticsWrapper } from './components/analytics'
import './globals.css'

// Big Shoulders Display's latin subset, as Google served it. next/font/google
// only knows the newer Big Shoulders, whose top optical size sets about 3%
// wider, which would widen every tile. OFL, see fonts/OFL.txt.
const display = localFont({
  src: './fonts/BigShouldersDisplay-latin.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-display'
})

const sans = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans'
})

const mono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono'
})

export const metadata: Metadata = {
  metadataBase: new URL('https://rotating-text.vercel.app'),
  title: 'Rotating Text: 3D flip text for React',
  description:
    'A 3D flip-on-hover text component for React, with no dependencies beyond React.',
  icons: { icon: '/favicon.ico' }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0E1526' },
    { media: '(prefers-color-scheme: light)', color: '#ECE8DD' }
  ]
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang='en'
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        {children}
        <AnalyticsWrapper />
      </body>
    </html>
  )
}
