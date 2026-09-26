import type { Metadata } from 'next'
import './globals.css'
import Nav from '../components/nav'

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
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
          {/* Navigation Sidebar */}
          <Nav />
          
          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
