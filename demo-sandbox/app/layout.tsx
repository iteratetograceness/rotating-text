import { Poppins } from '@next/font/google'
import './globals.css'

const poppins = Poppins({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap'
})

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en'>
      {/*
        <head /> will contain the components returned by the nearest parent
        head.tsx. Find out more at https://beta.nextjs.org/docs/api-reference/file-conventions/head
      */}
      <head />
      <body className={poppins.className}>
        {children}
        <footer>
          © <a href='https://joonie.dev'>Jueun Grace Yun</a>
        </footer>
      </body>
    </html>
  )
}
