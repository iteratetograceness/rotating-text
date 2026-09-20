import {
  Big_Shoulders_Display,
  IBM_Plex_Mono,
  IBM_Plex_Sans
} from '@next/font/google'
import { AnalyticsWrapper } from './components/analytics'
import './globals.css'

const display = Big_Shoulders_Display({
  weight: ['700', '800'],
  subsets: ['latin'],
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
      {/*
        <head /> will contain the components returned by the nearest parent
        head.tsx. Find out more at https://beta.nextjs.org/docs/api-reference/file-conventions/head
      */}
      <head />
      <body>
        {children}
        <AnalyticsWrapper />
      </body>
    </html>
  )
}
