import { useState } from "react"
import { StatusBadge } from "./StatusBadge"
import { AddToInvestigationModal } from "./AddToInvestigationModal"

interface Props {
  log: any
  onClose: () => void
}

export function RawLogDetailsModal({ log, onClose }: Props) {
  const [showInvestigateModal, setShowInvestigateModal] = useState(false)

  if (!log) return null

  const renderPayload = (payload: string) => {
    try {
      const parsed = JSON.parse(payload)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return payload
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1e1e24] border border-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1e1e24] sticky top-0 rounded-t-lg z-10">
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Raw Log Evidence</h2>
              <p className="text-sm text-gray-400 mt-1">ID: {log.id} • {log.event_identifier}</p>
            </div>
            <button
              onClick={() => setShowInvestigateModal(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
            >
              Add to Investigation
            </button>
            <a
              href={`/attack-timeline?search=${encodeURIComponent(log.event_identifier || '')}`}
              onClick={onClose}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded transition-colors inline-flex items-center space-x-1"
            >
              <span>View Timeline Context</span>
            </a>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Timestamp</label>
              <p className="text-sm text-gray-200 mt-1">{new Date(log.timestamp).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Received At</label>
              <p className="text-sm text-gray-200 mt-1">{log.received_at ? new Date(log.received_at).toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Source Type</label>
              <p className="text-sm text-gray-200 mt-1">{log.source_type}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Ingestion Status</label>
              <p className="mt-1"><StatusBadge status={log.ingestion_status || 'PENDING'} /></p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Agent ID</label>
              <p className="text-sm text-gray-200 mt-1">{log.agent_id || 'N/A'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Host ID</label>
              <p className="text-sm text-gray-200 mt-1">{log.host_id || 'N/A'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Event Identifier</label>
              <p className="text-sm text-gray-200 font-mono mt-1">{log.event_identifier || 'N/A'}</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-xs text-gray-500 uppercase font-semibold flex items-center justify-between mb-2">
              <span>Raw Payload</span>
              <span className="text-yellow-500/80 bg-yellow-500/10 px-2 py-0.5 rounded text-[10px]">EVIDENCE</span>
            </label>
            <div className="bg-[#151518] p-4 rounded-lg border border-gray-800/50">
              <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap overflow-auto max-h-96">
                {renderPayload(log.raw_payload)}
              </pre>
            </div>
          </div>

          {log.metadata_ && Object.keys(log.metadata_).length > 0 && (
            <div className="mt-6">
              <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">Processing Metadata</label>
              <div className="bg-[#151518] p-4 rounded-lg border border-gray-800/50">
                <pre className="text-sm font-mono text-gray-400 whitespace-pre-wrap overflow-auto">
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
