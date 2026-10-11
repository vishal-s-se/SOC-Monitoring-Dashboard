"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_SECTIONS = [
  {
    name: 'Overview',
    href: '/',
  },
  {
    name: 'Events & Logs',
    items: [
      { name: 'Unified Explorer', href: '/raw-logs' },
      { name: 'Live Events', href: '/live-events' },
      { name: 'Windows Logs', href: '/windows-logs' },
      { name: 'Linux Logs', href: '/linux-logs' },
      { name: 'Authentication', href: '/authentication' },
      { name: 'Network', href: '/network' },
      { name: 'Firewall', href: '/firewall' },
      { name: 'Processes', href: '/processes' },
    ]
  },
  {
    name: 'Detections & Investigations',
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
    name: 'Endpoints',
    items: [
      { name: 'Hosts', href: '/hosts' },
      { name: 'Agents', href: '/agents' },
    ]
  },
  {
    name: 'MITRE ATT&CK',
    href: '/mitre',
  },
  {
    name: 'System Health',
    href: '/system-health',
  }
]

export default function Nav() {
  const pathname = usePathname()
  // By default, open the section that contains the active path
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {}
    NAV_SECTIONS.forEach(section => {
      if (section.items) {
        initialState[section.name] = section.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))
      }
    })
    return initialState
  })

  if (pathname === '/login') {
    return null;
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
        {/* Simple inline SVG icon for SOC Monitor */}
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
            const isExpanded = expandedSections[section.name]
            const hasActiveChild = section.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

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
                  {section.name}
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
                      const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
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
    </nav>
  )
}
