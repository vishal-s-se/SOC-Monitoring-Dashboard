"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { name: 'Overview', href: '/' },
  { name: 'Live Events', href: '/live-events' },
  { name: 'Hosts', href: '/hosts' },
  { name: 'Windows Logs', href: '/windows-logs' },
  { name: 'Linux Logs', href: '/linux-logs' },
  { name: 'Firewall', href: '/firewall' },
  { name: 'Network', href: '/network' },
  { name: 'Authentication', href: '/authentication' },
  { name: 'Processes', href: '/processes' },
  { name: 'Alerts', href: '/alerts' },
  { name: 'Investigations', href: '/investigations' },
  { name: 'Behavioral Analytics', href: '/analytics' },
  { name: 'SOC Metrics', href: '/metrics' },
  { name: 'Attack Timeline', href: '/attack-timeline' },
  { name: 'IP Investigation', href: '/ip-investigation' },
  { name: 'Host Investigation', href: '/host-investigation' },
  { name: 'User Context', href: '/user-context' },
  { name: 'MITRE ATT&CK', href: '/mitre' },
  { name: 'Raw Logs', href: '/raw-logs' },
  { name: 'Agents', href: '/agents' },
  { name: 'Reports', href: '/reports' },
  { name: 'System Health', href: '/system-health' },
  { name: 'Settings', href: '/settings' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="w-64 bg-gray-900 text-white flex flex-col h-full shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-blue-400">SOC Monitor</h1>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`block px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
