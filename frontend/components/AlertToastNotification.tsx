"use client"

import { useEffect, useState, useRef } from "react"
import { useWebSocket } from "@/hooks/useWebSocket"
import { usePathname } from "next/navigation"
import { SeverityBadge } from "@/components/ui/SeverityBadge"
import { AlertDetailsModal } from "@/components/ui/AlertDetailsModal"

interface ToastAlert {
  id: string
  alert_id: string
  title: string
  severity: "HIGH" | "CRITICAL" | string
  summary: string
  timestamp: number
  raw?: any
}

export function AlertToastNotification() {
  const pathname = usePathname()
  const { lastMessage } = useWebSocket()
  const [toasts, setToasts] = useState<ToastAlert[]>([])
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null)
  
  // Track seen alert IDs to prevent duplicate toasts across reconnects or repeated messages
  const seenAlertIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!lastMessage || pathname === '/login') return

    if (lastMessage.type === 'new_alert' && lastMessage.data) {
      const data = lastMessage.data
      const severity = String(data.severity || '').toUpperCase()
      const alertId = String(data.alert_id || data.id || '')

      if (!alertId) return

      // Only HIGH and CRITICAL alerts
      if (severity === 'HIGH' || severity === 'CRITICAL') {
        if (seenAlertIds.current.has(alertId)) {
          return // Already notified
        }
        seenAlertIds.current.add(alertId)

        const newToast: ToastAlert = {
          id: alertId,
          alert_id: alertId,
          title: data.title || `High-Priority Security Detection`,
          severity: severity,
          summary: data.description || (data.rule_id ? `Triggered by rule ${data.rule_id}` : `Immediate SOC analyst investigation required`),
          timestamp: Date.now(),
          raw: data
        }

        setToasts(prev => [newToast, ...prev])

        // Automatically dismiss after ~2 seconds (2200ms)
        const timer = setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== alertId))
        }, 2200)

        return () => clearTimeout(timer)
      }
    }
  }, [lastMessage, pathname])

  if (pathname === '/login') return null

  return (
    <>
      {/* Accessible Live Region for Toasts */}
      <div 
        aria-live="assertive" 
        aria-atomic="true"
        className="fixed top-20 right-6 z-50 flex flex-col space-y-2.5 max-w-sm pointer-events-none"
      >
        {toasts.map((toast) => {
          const isCritical = toast.severity === 'CRITICAL'
          return (
            <div
              key={toast.id}
              role="alert"
              onClick={() => setSelectedAlert(toast.raw || { alert_id: toast.alert_id, title: toast.title, severity: toast.severity })}
              className={`pointer-events-auto cursor-pointer p-3.5 rounded-lg border shadow-2xl transition-all duration-300 transform translate-y-0 backdrop-blur-md ${
                isCritical 
                  ? 'bg-red-950/90 border-red-500/80 text-red-100 hover:bg-red-900/90' 
                  : 'bg-orange-950/90 border-orange-500/80 text-orange-100 hover:bg-orange-900/90'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <SeverityBadge severity={toast.severity} />
                  <span className="font-semibold text-xs tracking-wider uppercase text-white/90">
                    {isCritical ? 'CRITICAL ALERT' : 'HIGH ALERT'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 font-mono">2s toast</span>
              </div>
              <h4 className="font-medium text-sm text-white mt-1.5 leading-snug line-clamp-1">
                {toast.title}
              </h4>
              <p className="text-xs text-gray-300 mt-1 line-clamp-2 leading-relaxed">
                {toast.summary}
              </p>
              <div className="mt-2 text-[11px] text-blue-300 underline font-medium">
                Click to inspect alert details &rarr;
              </div>
            </div>
          )
        })}
      </div>

      {/* Alert Details Modal on Click */}
      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </>
  )
}
