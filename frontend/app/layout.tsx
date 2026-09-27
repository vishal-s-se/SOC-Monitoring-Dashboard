import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/nav'
import TopBar from '@/components/TopBar'

export const metadata: Metadata = {
  title: 'SOC Monitor',
  description: 'Lightweight Security Operations Center Monitoring',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
          <Nav />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1 overflow-y-auto p-6 bg-gray-950">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
