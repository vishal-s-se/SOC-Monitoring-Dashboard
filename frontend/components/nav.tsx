"use client"

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

interface NavItem {
  name: string
  href: string
}

interface NavSection {
  name: string
  href?: string
  defaultOpen?: boolean
  items?: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    name: 'Overview',
    href: '/',
  },
  {
    name: 'Windows',
    defaultOpen: true,
    items: [
      { name: 'Overview', href: '/windows' },
      { name: 'Live Events', href: '/live-events?os=windows' },
      { name: 'Windows Event Logs', href: '/windows-logs' },
      { name: 'Authentication', href: '/authentication?os=windows' },
      { name: 'Network', href: '/network?os=windows' },
      { name: 'Firewall', href: '/firewall?os=windows' },
      { name: 'Processes', href: '/processes?os=windows' },
      { name: 'Windows History', href: '/windows-history' },
    ]
  },
  {
    name: 'Linux',
    defaultOpen: true,
    items: [
      { name: 'Overview', href: '/linux' },
      { name: 'Live Events', href: '/live-events?os=linux' },
      { name: 'Linux Logs', href: '/linux-logs' },
      { name: 'Authentication', href: '/authentication?os=linux' },
      { name: 'Network', href: '/network?os=linux' },
      { name: 'Firewall', href: '/firewall?os=linux' },
      { name: 'Processes', href: '/processes?os=linux' },
      { name: 'Linux History', href: '/linux-history' },
    ]
  },
  {
    name: 'Endpoint Management',
    defaultOpen: true,
    items: [
      { name: 'Hosts', href: '/hosts' },
      { name: 'Agents', href: '/agents' },
    ]
  },
  {
    name: 'Detections & Investigations',
    defaultOpen: false,
    items: [
      { name: 'Alerts', href: '/alerts' },
      { name: 'Investigations', href: '/investigations' },
      { name: 'Attack Timeline', href: '/attack-timeline' },
      { name: 'Host Investigation', href: '/host-investigation' },
      { name: 'IP Investigation', href: '/ip-investigation' },
      { name: 'User Context', href: '/user-context' },
    ]
  },
  {
    name: 'MITRE ATT&CK',
    href: '/mitre',
  },
  {
    name: 'System Health',
    href: '/system-health',
  },
  {
    name: 'Advanced Tools',
    defaultOpen: false,
    items: [
      { name: 'Unified Explorer', href: '/raw-logs' },
    ]
  }
]

function NavContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentOs = searchParams.get('os')?.toLowerCase() || ''

  const isItemActive = (href: string) => {
    const [itemPath, itemQuery] = href.split('?')
    if (itemQuery) {
      const params = new URLSearchParams(itemQuery)
      const targetOs = params.get('os')?.toLowerCase()
      return pathname === itemPath && currentOs === targetOs
    }
    // No query in item href
    if (pathname === itemPath) {
      // If the current URL has an OS query parameter but the item doesn't expect one,
      // only match if neither windows nor linux is specified (or on dedicated OS routes like /windows-logs)
      if (currentOs && (itemPath === '/authentication' || itemPath === '/network' || itemPath === '/firewall' || itemPath === '/processes' || itemPath === '/live-events')) {
        return false
      }
      return true
    }
    return itemPath !== '/' && pathname.startsWith(itemPath + '/')
  }

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {}
    NAV_SECTIONS.forEach(section => {
      if (section.items) {
        const hasActive = section.items.some(item => isItemActive(item.href))
        // If an item is active, definitely expand. Otherwise use defaultOpen or specific OS match
        if (hasActive) {
          initialState[section.name] = true
        } else if (section.name === 'Windows' && (pathname.startsWith('/windows') || currentOs === 'windows')) {
          initialState[section.name] = true
        } else if (section.name === 'Linux' && (pathname.startsWith('/linux') || currentOs === 'linux')) {
          initialState[section.name] = true
        } else {
          initialState[section.name] = !!section.defaultOpen
        }
      }
    })
    return initialState
  })

  if (pathname === '/login') {
    return null
  }

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
  }

  return (
    <nav className="w-64 bg-gray-950 text-white flex flex-col h-full shrink-0 border-r border-gray-800">
      <div className="p-5 border-b border-gray-800 flex items-center space-x-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h1 className="text-xl font-bold text-gray-100 tracking-tight">SOC Monitor</h1>
      </div>
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {NAV_SECTIONS.map((section) => {
          if (section.href) {
            const isActive = pathname === section.href || (section.href !== '/' && pathname.startsWith(section.href))
            return (
              <div key={section.name}>
                <Link
                  href={section.href}
                  prefetch={true}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-600/10 text-blue-400'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {section.name}
                </Link>
              </div>
            )
          }

          if (section.items) {
            const isExpanded = !!expandedSections[section.name]
            const hasActiveChild = section.items.some(item => isItemActive(item.href))

            return (
              <div key={section.name} className="space-y-1">
                <button
                  onClick={() => toggleSection(section.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    hasActiveChild && !isExpanded
                      ? 'text-blue-400 bg-gray-900'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    {section.name === 'Windows' && (
                      <span className="w-2 h-2 rounded-full bg-sky-400 inline-block"></span>
                    )}
                    {section.name === 'Linux' && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                    )}
                    <span>{section.name}</span>
                  </span>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                
                {isExpanded && (
                  <div className="pl-4 space-y-1 mt-1 border-l border-gray-800 ml-3">
                    {section.items.map(item => {
                      const isActive = isItemActive(item.href)
                      return (
                        <Link
                          key={item.name + item.href}
                          href={item.href}
                          prefetch={true}
                          className={`block px-3 py-1.5 text-sm rounded-md transition-colors ${
                            isActive
                              ? 'bg-blue-600/10 text-blue-400 font-medium'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800'
                          }`}
                        >
                          {item.name}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return null
        })}
      </div>
      <div className="p-3 border-t border-gray-800 bg-gray-950/60">
        <Link
          href="/help"
          prefetch={true}
          className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            pathname.startsWith('/help')
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-3 text-blue-400"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Help & Docs
        </Link>
      </div>
    </nav>
  )
}

export default function Nav() {
  return (
    <Suspense fallback={<nav className="w-64 bg-gray-950 text-white flex flex-col h-full shrink-0 border-r border-gray-800" />}>
      <NavContent />
    </Suspense>
  )
}
