import { useState, useEffect } from "react"
import Link from "next/link"
import { SeverityBadge } from "./SeverityBadge"
import { StatusBadge } from "./StatusBadge"
import { AddToInvestigationModal } from "./AddToInvestigationModal"
import { api } from "@/lib/api"

interface Props {
  alert: any
  onClose: () => void
}

export function AlertDetailsModal({ alert, onClose }: Props) {
  const [showInvestigateModal, setShowInvestigateModal] = useState(false)
  const [mitreMappings, setMitreMappings] = useState<any[]>([])

  useEffect(() => {
    if (!alert) return
    async function loadMitre() {
      try {
        const idToSearch = alert.alert_id || String(alert.id)
        const mappings = await api.get<any[]>('/mitre/mappings', {
          target_type: 'ALERT',
          target_id: idToSearch
        })
        setMitreMappings(mappings || [])
      } catch {
        setMitreMappings([])
      }
    }
    loadMitre()
  }, [alert])

  if (!alert) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center space-x-3">
            <SeverityBadge severity={alert.severity} />
            <h3 className="text-lg font-semibold text-white">{alert.title}</h3>
            <Link
              href={`/attack-timeline?alert_id=${alert.id || alert.alert_id}`}
              onClick={onClose}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded transition-colors"
            >
              View Timeline
            </Link>
            <button
              onClick={() => setShowInvestigateModal(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
            >
              Add to Investigation
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg text-sm p-1.5"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status & Meta Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase">Status</p>
              <div className="mt-1"><StatusBadge status={alert.status} /></div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Occurrences</p>
              <p className="text-sm text-gray-200 font-semibold mt-1">x{alert.occurrence_count || 1}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">First Seen</p>
              <p className="text-sm text-gray-200 mt-1">{alert.first_seen ? new Date(alert.first_seen).toLocaleString() : 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Last Seen</p>
              <p className="text-sm text-gray-200 mt-1">{alert.last_seen ? new Date(alert.last_seen).toLocaleString() : 'N/A'}</p>
            </div>
          </div>

          {/* Host / Agent row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase">Alert ID</p>
              <p className="text-sm text-gray-200 font-mono mt-1">{alert.alert_id || String(alert.id)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Rule ID</p>
              <p className="text-sm text-gray-200 mt-1">{alert.rule_id || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Agent ID</p>
              <p className="text-sm text-gray-200 mt-1">{alert.agent_id || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Host ID</p>
              <p className="text-sm text-gray-200 mt-1">{alert.host_id || 'N/A'}</p>
            </div>
          </div>

          {/* Description */}
          {alert.description && (
            <div className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Description</h4>
              <p className="text-sm text-gray-300">{alert.description}</p>
            </div>
          )}

          {/* MITRE ATT&CK Section (Phase 7E-1) */}
          {mitreMappings && mitreMappings.length > 0 && (
            <div className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center space-x-2">
                <span>MITRE ATT&CK Techniques</span>
                <span className="text-xs bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded font-mono">
                  {mitreMappings.length}
                </span>
              </h4>
              <div className="space-y-2">
                {mitreMappings.map(m => (
                  <div key={m.id} className="p-3 bg-[#151922] border border-gray-800 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-red-300 bg-red-950/80 border border-red-800/60 px-2 py-0.5 rounded mr-2">
                        {m.technique_id}
                      </span>
                      <span className="text-sm font-semibold text-white">{m.technique_name || m.technique_id}</span>
                      {m.tactics && m.tactics.length > 0 && (
                        <span className="text-xs text-blue-300 ml-2">
                          ({m.tactics.map((t: any) => t.name).join(', ')})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-xs">
                      <span className="text-gray-400">
                        Source: <span className="text-gray-200">{m.mapping_source}</span>
                      </span>
                      <span className="text-gray-500">
                        Confidence: <span className="text-gray-300">{m.confidence}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {alert.metadata_ && Object.keys(alert.metadata_).length > 0 && (
            <div className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">Metadata</h4>
              <div className="bg-gray-950 p-4 rounded border border-gray-800 overflow-x-auto">
                <pre className="text-xs text-gray-300 font-mono">
                  {JSON.stringify(alert.metadata_, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {showInvestigateModal && (
        <AddToInvestigationModal
          evidenceType="ALERT"
          referenceId={String(alert.id)}
          defaultTitle={`Investigation: ${alert.title}`}
          onClose={() => setShowInvestigateModal(false)}
        />
      )}
    </div>
  )
}
