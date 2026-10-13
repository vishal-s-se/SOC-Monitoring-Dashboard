"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

export interface ClearLogsButtonProps {
  operatingSystem: string // "windows", "linux", or "all"
  tabCategory: string     // "logs", "live", "authentication", "network", "firewall", "processes", "all"
  tabTitle: string        // e.g. "Overall Dashboard", "Windows Event Logs", "Linux Logs"
  onCleared?: () => void  // Callback to reload active view data
  historyUrl?: string     // e.g. "/windows-history", "/linux-history", or custom
  activeFilters?: Record<string, string | number | undefined>
  className?: string
}

export function ClearLogsButton({
  operatingSystem,
  tabCategory,
  tabTitle,
  onCleared,
  historyUrl,
  activeFilters = {},
  className = ""
}: ClearLogsButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  const isOverall = operatingSystem === 'all' || tabCategory === 'all'
  const isWindows = operatingSystem.toLowerCase().includes('win')
  const isLinux = operatingSystem.toLowerCase().includes('linux') || operatingSystem.toLowerCase().includes('kali')

  const defaultHistoryUrl = historyUrl || (
    isOverall ? '/windows-history' : isWindows ? '/windows-history' : '/linux-history'
  )

  const activeFilterEntries = Object.entries(activeFilters).filter(
    ([, val]) => val !== undefined && val !== "" && val !== null
  )

  const handleClear = async () => {
    try {
      setLoading(true)
      setError("")
      await api.post('/events/view-clear', {
        operating_system: operatingSystem,
        category: tabCategory
      })
      setSuccessMsg(
        isOverall
          ? "Overall dashboard view cleared! All events are safely archived in Windows & Linux History."
          : `Active view cleared! All events are safely archived in ${isWindows ? 'Windows' : 'Linux'} History.`
      )
      setTimeout(() => {
        setIsOpen(false)
        setSuccessMsg("")
        if (onCleared) {
          onCleared()
        }
      }, 900)
    } catch (err: any) {
      setError(err.message || "Failed to clear active view")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("")
          setSuccessMsg("")
          setIsOpen(true)
        }}
        className={`clear-logs-btn inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${className}`}
        title={`Clear ${tabTitle} logs from this view (preserves all records in OS History)`}
      >
        <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>Clear Logs</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-950 border border-gray-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center space-x-3 text-cyan-400">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/70 border border-cyan-800/80 flex items-center justify-center">
                <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Clear Active Logs View</h3>
                <p className="text-xs text-gray-400">Target View: <span className="text-cyan-300 font-semibold">{tabTitle}</span></p>
              </div>
            </div>

            {/* Scope Details */}
            <div className="p-3 bg-gray-900/80 border border-gray-800 rounded-lg text-xs space-y-1.5 font-mono">
              <div className="text-gray-400 font-sans font-semibold text-[11px] uppercase tracking-wider">Operation Scope:</div>
              <div className="flex justify-between">
                <span className="text-gray-400">Operating System:</span>
                <span className="text-cyan-300 font-semibold">{operatingSystem === 'all' ? 'All (Windows + Linux)' : operatingSystem.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Category / Tab:</span>
                <span className="text-cyan-300 font-semibold">{tabCategory === 'all' ? 'Aggregated Flow' : tabCategory}</span>
              </div>
              {activeFilterEntries.length > 0 && (
                <div className="pt-1 border-t border-gray-800 space-y-0.5">
                  <div className="text-gray-400 text-[10px] uppercase font-sans">Active Filters:</div>
                  {activeFilterEntries.map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px]">
                      <span className="text-gray-500">{k}:</span>
                      <span className="text-gray-300">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Non-Destructive Guarantee Banner */}
            <div className="p-3 bg-blue-950/30 border border-blue-800/50 rounded-lg text-xs space-y-1 text-gray-200">
              <div className="flex items-center space-x-1.5 text-blue-300 font-semibold">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Non-Destructive Guarantee</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                Raw events are <strong>never permanently deleted</strong>. Records prior to this moment will be hidden from the active view, but all underlying evidence and audit logs remain permanently preserved in PostgreSQL.
                {isOverall ? (
                  <> Access historical records anytime in <Link href="/windows-history" className="text-cyan-400 underline hover:text-cyan-300">Windows History</Link> and <Link href="/linux-history" className="text-cyan-400 underline hover:text-cyan-300">Linux History</Link>.</>
                ) : (
                  <> Access historical records anytime in <Link href={defaultHistoryUrl} className="text-cyan-400 underline hover:text-cyan-300">{isWindows ? 'Windows History' : 'Linux History'}</Link>.</>
                )}
              </p>
            </div>

            {error && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 rounded text-xs text-red-300">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 bg-green-950/60 border border-green-800 rounded text-xs text-green-300">
                {successMsg}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={loading}
                className="px-3.5 py-1.5 text-xs text-gray-300 hover:text-white bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="clear-logs-btn px-4 py-1.5 text-xs font-semibold rounded-md disabled:opacity-50"
              >
                {loading ? "Clearing..." : "Confirm Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Backwards-compatible export alias for any components importing TabClearControl
export const TabClearControl = ClearLogsButton
