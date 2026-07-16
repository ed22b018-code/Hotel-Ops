import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aurelia — Hotel Operations Console',
  description: 'Hotel Operations Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
