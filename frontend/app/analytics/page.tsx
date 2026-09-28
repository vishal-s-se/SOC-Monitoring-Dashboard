"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { DataTable } from '@/components/ui/DataTable'
import { Pagination } from '@/components/ui/Pagination'
import Link from 'next/link'
import { useWebSocket } from '@/hooks/useWebSocket'
import { EventDetailsModal } from '@/components/ui/EventDetailsModal'

export default function AnalyticsPage() {
  const [baselines, setBaselines] = useState<any[]>([])
  const [deviations, setDeviations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [entityFilter, setEntityFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)

  const [viewEvent, setViewEvent] = useState<any>(null)
  const [expandedDeviations, setExpandedDeviations] = useState<Record<number, any[]>>({})

  const { lastMessage } = useWebSocket()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const skip = (page - 1) * pageSize
      let devUrl = `/analytics/deviations?skip=${skip}&limit=${pageSize}`
      let baseUrl = `/analytics/baselines`
      
      if (typeFilter !== 'ALL') {
        devUrl += `&entity_type=${typeFilter}`
        baseUrl += `?entity_type=${typeFilter}`
      }
      
      const [devRes, baseRes] = await Promise.all([
        api.get<any[]>(devUrl),
        api.get<any[]>(baseUrl)
      ])
      
      setDeviations(devRes || [])
      setBaselines(baseRes || [])
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, typeFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'behavior_deviation_created' || lastMessage.type === 'baseline_updated') {
      loadData()
    }
  }, [lastMessage, loadData])

  const filteredBaselines = baselines.filter(b => {
    if (entityFilter && !b.entity_id.toLowerCase().includes(entityFilter.toLowerCase())) return false;
    return true;
  });

  const filteredDeviations = deviations.filter(d => {
    if (entityFilter && !d.entity_id.toLowerCase().includes(entityFilter.toLowerCase())) return false;
    return true;
  });

  const getEntityLink = (type: string, id: string) => {
    if (type === 'HOST') return `/host-investigation?host=${encodeURIComponent(id)}`
    if (type === 'IP') return `/ip-investigation?ip=${encodeURIComponent(id)}`
    if (type === 'USER') return `/user-context?user=${encodeURIComponent(id)}`
    return '#'
  }

  if (loading && baselines.length === 0) return <LoadingState message="Loading behavioral analytics..." />
  if (error) return <ErrorState message={error} retry={loadData} />

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Behavioral Analytics</h1>
        <p className="text-gray-400 text-sm">
          Explainable historical baselines and behavioral deviations across the environment.
        </p>
      </div>

      <div className="flex items-center space-x-4 bg-[#151518] p-4 rounded-lg border border-gray-800">
        <div>
          <label className="block text-xs text-gray-500 mb-1 uppercase font-semibold">Entity Type</label>
          <select 
            value={typeFilter} 
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="bg-gray-900 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Types</option>
            <option value="HOST">Host</option>
            <option value="USER">User</option>
            <option value="IP">IP Address</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1 uppercase font-semibold">Filter Entity ID</label>
          <input
            type="text"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            placeholder="Search hostname, IP, or username..."
            className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader title="Behavioral Deviations" subtitle="Recent anomalies compared to established baselines" />
            <CardContent className="p-0">
              {filteredDeviations.length === 0 ? (
                <EmptyState title="No Deviations" description="No behavioral deviations observed for the selected filters." />
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {filteredDeviations.map(dev => (
                    <div key={dev.id} className="p-4 hover:bg-[#151518] transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            dev.deviation_magnitude > 5 ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-yellow-950 text-yellow-400 border border-yellow-800'
                          }`}>
                            {dev.deviation_magnitude > 5 ? 'High Deviation' : 'Significant'}
                          </span>
                          <span className="text-sm font-semibold text-white">
                            {dev.metric_name.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-gray-500">•</span>
                          <Link href={getEntityLink(dev.entity_type, dev.entity_id)} className="text-sm font-medium text-blue-400 hover:underline">
                            {dev.entity_id}
                          </Link>
                          <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{dev.entity_type}</span>
                        </div>
                        <span className="text-xs text-gray-500">{new Date(dev.observation_timestamp).toLocaleString()}</span>
                      </div>
                      
                      <div className="bg-[#111115] border border-gray-800 rounded p-3 text-sm text-gray-300 mb-3">
                        {dev.explanation}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-4 text-gray-400">
                          <div>
                            <span className="text-gray-500">Expected:</span> <span className="font-mono text-gray-300">{dev.expected_value.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Observed:</span> <span className="font-mono text-white">{dev.observed_value.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Magnitude:</span> <span className="font-mono text-gray-300">{dev.deviation_magnitude.toFixed(1)}σ</span>
                          </div>
                        </div>
                        {dev.evidence && dev.evidence.length > 0 && (
                          <div className="flex gap-2">
                            {dev.evidence.filter((e: any) => e.evidence_type === 'EVENT').map((e: any) => (
                              <button
                                key={e.id}
                                onClick={async () => {
                                  try {
                                    const evData = await api.get(`/events/${e.reference_id}`)
                                    setViewEvent(evData)
                                  } catch (err) {
                                    alert("Could not load event")
                                  }
                                }}
                                className="text-[11px] bg-blue-900/30 hover:bg-blue-900/50 text-blue-300 border border-blue-800/50 px-2 py-1 rounded"
                              >
                                View Evidence Event
                              </button>
                            ))}
                            <button
                                onClick={async () => {
                                  if (expandedDeviations[dev.id]) {
                                    const next = { ...expandedDeviations };
                                    delete next[dev.id];
                                    setExpandedDeviations(next);
                                  } else {
                                    try {
                                      const cors = await api.get<any[]>(`/analytics/deviations/${dev.id}/correlations`);
                                      setExpandedDeviations({ ...expandedDeviations, [dev.id]: cors || [] });
                                    } catch (err) {}
                                  }
                                }}
                                className="text-[11px] bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-800/50 px-2 py-1 rounded"
                              >
                                {expandedDeviations[dev.id] ? 'Hide Relationships' : 'View Relationships'}
                              </button>
                          </div>
                        )}
                      </div>
                      
                      {expandedDeviations[dev.id] && (
                        <div className="mt-3 pt-3 border-t border-gray-800 text-xs">
                          <h4 className="text-gray-400 font-semibold mb-2">Cross-Entity Correlations</h4>
                          {expandedDeviations[dev.id].length === 0 ? (
                            <div className="text-gray-500 italic">No correlated entities found.</div>
                          ) : (
                            <div className="space-y-2">
                              {expandedDeviations[dev.id].map((cor: any) => (
                                <div key={cor.id} className="flex items-center gap-3 bg-[#111115] p-2 rounded border border-gray-800">
                                  <span className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">{cor.relationship_type}</span>
                                  <span className="text-purple-400 font-medium w-16">{cor.related_entity_type}</span>
                                  <Link href={getEntityLink(cor.related_entity_type, cor.related_entity_id)} className="text-blue-400 hover:underline font-mono">
                                    {cor.related_entity_id}
                                  </Link>
                                  <span className="text-gray-500 flex-1">{cor.relationship_reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={deviations.length === pageSize ? page * pageSize + 1 : (page - 1) * pageSize + deviations.length} // Approximation since we don't have total count endpoint
            onPageChange={setPage}
          />
        </div>

        <div>
          <Card>
            <CardHeader title="Established Baselines" subtitle="Historical models tracking entity behavior" />
            <CardContent className="p-0">
              {filteredBaselines.length === 0 ? (
                <EmptyState title="No Baselines" description="No baselines established yet." />
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {filteredBaselines.map(base => (
                    <div key={base.id} className="p-3 hover:bg-[#151518]">
                      <div className="flex justify-between items-center mb-1">
                        <Link href={getEntityLink(base.entity_type, base.entity_id)} className="text-sm font-medium text-blue-400 hover:underline truncate mr-2">
                          {base.entity_id}
                        </Link>
                        <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded shrink-0">{base.entity_type}</span>
                      </div>
                      <div className="text-xs text-white font-medium mb-2">{base.metric_name.replace(/_/g, ' ')}</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400 bg-[#111115] p-2 rounded border border-gray-800/50">
                        <div>Expected: <span className="text-gray-200 font-mono">{base.expected_value.toFixed(2)}</span></div>
                        <div>StdDev: <span className="text-gray-200 font-mono">{base.variance.toFixed(2)}</span></div>
                        <div>Samples: <span className="text-gray-200">{base.sample_count}</span></div>
                        <div>Window: <span className="text-gray-200">{base.time_window}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {viewEvent && (
        <EventDetailsModal
          event={viewEvent}
          onClose={() => setViewEvent(null)}
        />
      )}
    </div>
  )
}
