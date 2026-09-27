"use client"

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/Card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/ui/States'
import { Pagination } from '@/components/ui/Pagination'
import { MitreTechniqueDetailsModal } from '@/components/ui/MitreTechniqueDetailsModal'

export default function MitrePage() {
  const [tactics, setTactics] = useState<any[]>([])
  const [techniques, setTechniques] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Filters
  const [search, setSearch] = useState("")
  const [selectedTactic, setSelectedTactic] = useState("")
  const [subtechniqueFilter, setSubtechniqueFilter] = useState("all") // "all", "techniques", "subtechniques"
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [total, setTotal] = useState(0)

  // Selected technique for detail modal
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<string | null>(null)
  const [techniqueDetail, setTechniqueDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Fetch tactics for the filter bar
  useEffect(() => {
    async function loadTactics() {
      try {
        const res = await api.get<any[]>('/mitre/tactics')
        setTactics(res || [])
      } catch (err) {
        console.error("Failed to load tactics:", err)
      }
    }
    loadTactics()
  }, [])

  // Fetch techniques
  const fetchTechniques = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, any> = {
        page,
        page_size: pageSize
      }
      if (search.trim()) params.search = search.trim()
      if (selectedTactic) params.tactic = selectedTactic
      if (subtechniqueFilter === 'techniques') params.is_subtechnique = false
      if (subtechniqueFilter === 'subtechniques') params.is_subtechnique = true

      const res = await api.get<any>('/mitre/techniques', params)
      setTechniques(res.items || [])
      setTotal(res.total || 0)
      setError("")
    } catch (err: any) {
      setError(err.message || "Failed to load MITRE ATT&CK techniques")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, selectedTactic, subtechniqueFilter])

  useEffect(() => {
    fetchTechniques()
  }, [fetchTechniques])

  // Fetch technique detail when one is clicked
  const handleSelectTechnique = async (tid: string) => {
    setSelectedTechniqueId(tid)
    try {
      setLoadingDetail(true)
      const detail = await api.get<any>(`/mitre/techniques/${tid}`)
      setTechniqueDetail(detail)
    } catch (err: any) {
      alert("Failed to load technique detail: " + err.message)
      setSelectedTechniqueId(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleResetFilters = () => {
    setSearch("")
    setSelectedTactic("")
    setSubtechniqueFilter("all")
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="MITRE ATT&CK Enterprise Catalog"
        description="Official MITRE ATT&CK Enterprise tactics and techniques foundation with evidence-based mapping"
        actions={
          <div className="flex items-center space-x-2 text-xs text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>ATT&CK Enterprise v14.1</span>
          </div>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Search */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                Search
              </label>
              <input
                type="text"
                placeholder="ID, Name, or description..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="w-full bg-[#151518] border border-gray-800 rounded p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Tactic Filter */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                Tactic
              </label>
              <select
                value={selectedTactic}
                onChange={e => { setSelectedTactic(e.target.value); setPage(1) }}
                className="w-full bg-[#151518] border border-gray-800 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Tactics ({tactics.length})</option>
                {tactics.map(t => (
                  <option key={t.tactic_id} value={t.tactic_id}>
                    {t.order_index}. {t.name} ({t.tactic_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Scope / Subtechnique Filter */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                Hierarchy
              </label>
              <select
                value={subtechniqueFilter}
                onChange={e => { setSubtechniqueFilter(e.target.value); setPage(1) }}
                className="w-full bg-[#151518] border border-gray-800 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Items</option>
                <option value="techniques">Techniques Only</option>
                <option value="subtechniques">Sub-techniques Only</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-end">
              <button
                onClick={handleResetFilters}
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded text-xs font-medium transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Techniques Table / List */}
      {loading ? (
        <LoadingState message="Loading MITRE ATT&CK techniques..." />
      ) : error ? (
        <ErrorState message={error} retry={fetchTechniques} />
      ) : techniques.length === 0 ? (
        <EmptyState
          title="No Techniques Found"
          description="No MITRE ATT&CK techniques match your current filter parameters."
        />
      ) : (
        <div className="space-y-4">
          <div className="border border-gray-800 rounded-lg overflow-hidden bg-gray-900 shadow">
            <table className="min-w-full divide-y divide-gray-800 text-xs">
              <thead className="bg-[#121620] text-gray-400 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Technique ID</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Tactics</th>
                  <th className="px-4 py-3 text-left">Parent / Hierarchy</th>
                  <th className="px-4 py-3 text-left">Platforms</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {techniques.map(t => (
                  <tr
                    key={t.technique_id}
                    onClick={() => handleSelectTechnique(t.technique_id)}
                    className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-red-300 font-bold px-2 py-0.5 rounded bg-red-950/70 border border-red-800/50">
                        {t.technique_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      <div className="flex items-center space-x-2">
                        <span>{t.name}</span>
                        {t.is_subtechnique && (
                          <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.2 rounded border border-gray-700">
                            sub
                          </span>
                        )}
                        {t.is_deprecated && (
                          <span className="text-[10px] bg-yellow-950 text-yellow-400 px-1.5 py-0.2 rounded border border-yellow-700">
                            dep
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {t.tactics && t.tactics.map((tac: any) => (
                          <span key={tac.tactic_id} className="bg-blue-950/70 border border-blue-800/50 text-blue-300 px-2 py-0.5 rounded text-[11px]">
                            {tac.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400">
                      {t.parent_technique_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {t.platforms ? t.platforms.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleSelectTechnique(t.technique_id)
                        }}
                        className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded transition-colors text-xs"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Technique Details Modal */}
      {selectedTechniqueId && techniqueDetail && (
        <MitreTechniqueDetailsModal
          technique={techniqueDetail}
          onClose={() => {
            setSelectedTechniqueId(null)
            setTechniqueDetail(null)
          }}
        />
      )}
    </div>
  )
}
