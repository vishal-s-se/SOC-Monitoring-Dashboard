"use client"

import { useEffect, useState } from 'react'

interface ServiceStatus {
  status: 'online' | 'offline' | 'checking'
  service?: string
  latencyMs?: number
}

export default function Home() {
  const [backendStatus, setBackendStatus] = useState<ServiceStatus>({ status: 'checking' })
  const [collectorStatus, setCollectorStatus] = useState<ServiceStatus>({ status: 'checking' })

  const checkServices = async () => {
    // Check Backend
    const t0 = performance.now()
    try {
      const res = await fetch('http://localhost:8000/health', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBackendStatus({
          status: 'online',
          service: data.service,
          latencyMs: Math.round(performance.now() - t0)
        })
      } else {
        setBackendStatus({ status: 'offline' })
      }
    } catch {
      setBackendStatus({ status: 'offline' })
    }

    // Check Collector
    const t1 = performance.now()
    try {
      const res = await fetch('http://localhost:5000/health', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCollectorStatus({
          status: 'online',
          service: data.service,
          latencyMs: Math.round(performance.now() - t1)
        })
      } else {
        setCollectorStatus({ status: 'offline' })
      }
    } catch {
      setCollectorStatus({ status: 'offline' })
    }
  }

  useEffect(() => {
    checkServices()
    const interval = setInterval(checkServices, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            SOC Monitor Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Phase 1 Architecture & Real-Time Local Services
          </p>
        </div>
        <button
          onClick={checkServices}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Refresh Status
        </button>
      </div>

      {/* System Status Cards */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Local Service Health
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Backend API */}
          <div className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-gray-50/50 dark:bg-gray-900/30">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200">Backend API</h3>
              <span className="text-xs font-mono text-gray-400">:8000</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {backendStatus.status === 'online' ? (
                <>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Online
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{backendStatus.latencyMs}ms</span>
                </>
              ) : backendStatus.status === 'checking' ? (
                <span className="text-xs text-amber-500 animate-pulse">Checking...</span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  Offline
                </span>
              )}
            </div>
            <div className="mt-3 text-xs">
              <a 
                href="http://localhost:8000/docs" 
                target="_blank" 
                rel="noreferrer"
                className="text-blue-500 hover:underline font-medium"
              >
                Swagger Docs &rarr;
              </a>
            </div>
          </div>

          {/* Collector API */}
          <div className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-gray-50/50 dark:bg-gray-900/30">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200">Collector API</h3>
              <span className="text-xs font-mono text-gray-400">:5000</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {collectorStatus.status === 'online' ? (
                <>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Online
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{collectorStatus.latencyMs}ms</span>
                </>
              ) : collectorStatus.status === 'checking' ? (
                <span className="text-xs text-amber-500 animate-pulse">Checking...</span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  Offline
                </span>
              )}
            </div>
            <div className="mt-3 text-xs">
              <a 
                href="http://localhost:5000/docs" 
                target="_blank" 
                rel="noreferrer"
                className="text-blue-500 hover:underline font-medium"
              >
                Swagger Docs &rarr;
              </a>
            </div>
          </div>

          {/* Database */}
          <div className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-gray-50/50 dark:bg-gray-900/30">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200">Database & Redis</h3>
              <span className="text-xs font-mono text-gray-400">:5432 / :6379</span>
            </div>
            <div className="mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                Phase 2 Integration
              </span>
            </div>
            <p className="mt-3 text-xs text-gray-500">Configured in .env</p>
          </div>
        </div>
      </div>

      {/* Quick Launch & Documentation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Local Endpoints
          </h3>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-300">Frontend Dashboard</span>
              <a href="http://localhost:3000" className="font-mono text-blue-600 dark:text-blue-400 hover:underline">http://localhost:3000</a>
            </li>
            <li className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-300">Backend API</span>
              <a href="http://localhost:8000" target="_blank" rel="noreferrer" className="font-mono text-blue-600 dark:text-blue-400 hover:underline">http://localhost:8000</a>
            </li>
            <li className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-300">Collector API</span>
              <a href="http://localhost:5000" target="_blank" rel="noreferrer" className="font-mono text-blue-600 dark:text-blue-400 hover:underline">http://localhost:5000</a>
            </li>
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Quick CLI Controls
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="bg-gray-100 dark:bg-gray-900 p-2.5 rounded text-gray-800 dark:text-gray-200">
              <p className="text-gray-400"># Start all services</p>
              <code>.\run.bat &nbsp;or&nbsp; .\scripts\start-all.ps1</code>
            </div>
            <div className="bg-gray-100 dark:bg-gray-900 p-2.5 rounded text-gray-800 dark:text-gray-200">
              <p className="text-gray-400"># Stop all services</p>
              <code>.\scripts\stop-all.bat &nbsp;or&nbsp; .\scripts\stop-all.ps1</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
