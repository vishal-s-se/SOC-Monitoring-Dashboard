import { useState } from "react"
import { StatusBadge } from "./StatusBadge"
import { AddToInvestigationModal } from "./AddToInvestigationModal"

interface Props {
  log: any
  onClose: () => void
}

export function RawLogDetailsModal({ log, onClose }: Props) {
  const [showInvestigateModal, setShowInvestigateModal] = useState(false)
  const [payloadExpanded, setPayloadExpanded] = useState(false)
  const [payloadCopied, setPayloadCopied] = useState(false)
  const [idCopied, setIdCopied] = useState(false)
  const [metaCopied, setMetaCopied] = useState(false)

  if (!log) return null

  const getFormattedPayload = (payload: any): string => {
    if (!payload) return ""
    if (typeof payload === 'object') {
      try {
        return JSON.stringify(payload, null, 2)
      } catch {
        return String(payload)
      }
    }
    try {
      const parsed = JSON.parse(payload)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return String(payload)
    }
  }

  const formattedPayload = getFormattedPayload(log.raw_payload)

  const handleCopy = (text: string, setCopied: (v: boolean) => void) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/70 backdrop-blur-sm p-3 sm:p-4 md:p-6">
      <div 
        className="bg-[#1e1e24] border border-gray-800 rounded-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden min-w-0"
        style={{ width: 'min(75vw, 1400px)', minWidth: 'min(100%, 360px)' }}
      >
        {/* Header & Action Toolbar - Responsive Grid Layout */}
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-[#1e1e24] sticky top-0 z-10 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start min-w-0">
            {/* Left Section: Title, Record ID, and Event Identifier */}
            <div className="min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight shrink-0">
                  Raw Log Evidence
                </h2>
                {log.id !== undefined && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-800 text-blue-400 border border-gray-700/80 shrink-0">
                    Record #{log.id}
                  </span>
                )}
              </div>

              {log.event_identifier && (
                <div className="flex items-start gap-1.5 text-xs text-gray-400 min-w-0 bg-gray-900/60 px-2.5 py-1.5 rounded border border-gray-800">
                  <span className="text-gray-500 font-semibold shrink-0 mt-0.5">ID:</span>
                  <span 
                    className="font-mono text-gray-300 break-all select-all flex-1 min-w-0"
                    style={{ overflowWrap: 'anywhere' }}
                    title={log.event_identifier}
                  >
                    {log.event_identifier}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(log.event_identifier, setIdCopied)}
                    className="text-gray-400 hover:text-white p-0.5 shrink-0 transition-colors rounded hover:bg-gray-800"
                    title="Copy Event Identifier"
                  >
                    {idCopied ? (
                      <span className="text-[10px] text-green-400 font-medium">Copied!</span>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"></path>
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Right Section: Action Buttons and Close - Guaranteed Inside Modal Boundary */}
            <div className="flex items-center flex-wrap gap-2 shrink-0 justify-start md:justify-end">
              <button
                type="button"
                onClick={() => setShowInvestigateModal(true)}
                className="text-xs bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium px-3 py-1.5 rounded transition-colors inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add to Investigation</span>
              </button>

              <a
                href={`/attack-timeline?search=${encodeURIComponent(log.event_identifier || String(log.id || ''))}`}
                onClick={onClose}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium px-3 py-1.5 rounded transition-colors inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>View Timeline Context</span>
              </a>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                title="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 space-y-6 min-w-0">
          {/* Metadata Grid */}
          <div className="bg-gray-900/40 border border-gray-800/80 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Telemetry &amp; Ingestion Metadata
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Record ID</label>
                <p className="text-sm text-gray-200 font-mono mt-0.5">{log.id ?? 'N/A'}</p>
              </div>
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Source Type</label>
                <p className="text-sm text-gray-200 mt-0.5 truncate" title={log.source_type}>{log.source_type || 'N/A'}</p>
              </div>
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Ingestion Status</label>
                <div className="mt-0.5"><StatusBadge status={log.ingestion_status || 'PENDING'} /></div>
              </div>
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Agent ID</label>
                <p className="text-sm text-gray-200 font-mono mt-0.5">{log.agent_id ?? 'N/A'}</p>
              </div>
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Host ID</label>
                <p className="text-sm text-gray-200 font-mono mt-0.5 truncate" title={log.host_id}>{log.host_id ?? 'N/A'}</p>
              </div>
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Event Timestamp</label>
                <p className="text-sm text-gray-200 mt-0.5 truncate" title={log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}>
                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div className="min-w-0">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Received At</label>
                <p className="text-sm text-gray-200 mt-0.5 truncate" title={log.received_at ? new Date(log.received_at).toLocaleString() : 'N/A'}>
                  {log.received_at ? new Date(log.received_at).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div className="min-w-0 col-span-2 sm:col-span-1 lg:col-span-1">
                <label className="text-[11px] text-gray-500 uppercase font-semibold block">Event Identifier</label>
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <p className="text-sm text-gray-200 font-mono truncate" title={log.event_identifier}>
                    {log.event_identifier || 'N/A'}
                  </p>
                  {log.event_identifier && (
                    <button
                      type="button"
                      onClick={() => handleCopy(log.event_identifier, setIdCopied)}
                      className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors shrink-0"
                      title="Copy Event Identifier"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"></path>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Raw Payload Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400 uppercase font-semibold tracking-wider">
                  Raw Payload
                </label>
                <span className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider">
                  EVIDENCE
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPayloadExpanded(!payloadExpanded)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1"
                >
                  <svg className={`w-3.5 h-3.5 transform transition-transform ${payloadExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                  <span>{payloadExpanded ? 'Collapse' : 'Expand'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(formattedPayload, setPayloadCopied)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5"
                >
                  {payloadCopied ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-400 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2"></path>
                      </svg>
                      <span>Copy Payload</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-[#121216] p-4 rounded-lg border border-gray-800/90 shadow-inner overflow-hidden">
              <pre className={`text-xs sm:text-sm font-mono text-gray-300 whitespace-pre-wrap break-all sm:break-words overflow-auto ${payloadExpanded ? 'max-h-none' : 'max-h-80'} transition-all`}>
                {formattedPayload || '<Empty Payload>'}
              </pre>
            </div>
          </div>

          {/* Processing Metadata */}
          {log.metadata_ && Object.keys(log.metadata_).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 uppercase font-semibold tracking-wider">
                  Processing Metadata
                </label>
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(log.metadata_, null, 2), setMetaCopied)}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-2.5 py-1 rounded transition-colors inline-flex items-center gap-1.5"
                >
                  {metaCopied ? (
                    <span className="text-green-400 font-medium">Copied!</span>
                  ) : (
                    <span>Copy Metadata</span>
                  )}
                </button>
              </div>
              <div className="bg-[#121216] p-4 rounded-lg border border-gray-800/90 shadow-inner overflow-hidden">
                <pre className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all overflow-auto max-h-60">
                  {JSON.stringify(log.metadata_, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInvestigateModal && (
        <AddToInvestigationModal
          evidenceType="RAW_LOG"
          referenceId={String(log.id)}
          defaultTitle={`Investigation: Raw Log ${log.id}`}
          onClose={() => setShowInvestigateModal(false)}
        />
      )}
    </div>
  )
}
