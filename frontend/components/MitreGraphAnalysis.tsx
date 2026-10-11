"use client"

import { useState, useMemo } from 'react'

interface GraphNode {
  id: string
  label: string
  name?: string
  technique_id?: string
  type: 'tactic' | 'technique' | 'subtechnique'
  tactic_id?: string
  order_index?: number
  description?: string
  is_subtechnique?: boolean
  parent_technique_id?: string
  platforms?: string[]
  evidence_count?: number
  has_evidence?: boolean
  tactics?: string[]
}

interface GraphEdge {
  source: string
  target: string
  type: string
  label?: string
}

interface MitreGraphAnalysisProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  loading: boolean
  onSelectTechnique: (techniqueId: string) => void
  selectedTactic: string
  onTacticChange: (tacticId: string) => void
  search: string
  onSearchChange: (search: string) => void
  tactics: any[]
}

export function MitreGraphAnalysis({
  nodes,
  edges,
  loading,
  onSelectTechnique,
  selectedTactic,
  onTacticChange,
  search,
  onSearchChange,
  tactics
}: MitreGraphAnalysisProps) {
  const [zoomLevel, setZoomLevel] = useState(1)
  const [activeNode, setActiveNode] = useState<GraphNode | null>(null)
  const [filterEvidenceOnly, setFilterEvidenceOnly] = useState(false)

  // Separate tactics and techniques
  const tacticNodes = useMemo(() => {
    return nodes
      .filter(n => n.type === 'tactic')
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  }, [nodes])

  // Map of technique nodes indexed by ID
  const techniqueNodesMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    nodes.filter(n => n.type !== 'tactic').forEach(n => map.set(n.id, n))
    return map
  }, [nodes])

  // Filter techniques based on search and evidence flag
  const filteredTechniques = useMemo(() => {
    return nodes.filter(n => {
      if (n.type === 'tactic') return false
      if (filterEvidenceOnly && !n.has_evidence) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchId = (n.technique_id || '').toLowerCase().includes(q)
        const matchName = (n.name || '').toLowerCase().includes(q)
        return matchId || matchName
      }
      return true
    })
  }, [nodes, filterEvidenceOnly, search])

  // Group techniques by tactic according to edges
  const tacticToTechniques = useMemo(() => {
    const grouped: Record<string, GraphNode[]> = {}
    tacticNodes.forEach(t => {
      grouped[t.id] = []
    })

    const filteredSet = new Set(filteredTechniques.map(n => n.id))

    edges.forEach(e => {
      if (e.type === 'includes' && grouped[e.source] && filteredSet.has(e.target)) {
        const techNode = techniqueNodesMap.get(e.target)
        if (techNode && !techNode.is_subtechnique) {
          grouped[e.source].push(techNode)
        }
      }
    })

    return grouped
  }, [tacticNodes, edges, filteredTechniques, techniqueNodesMap])

  // Sub-techniques grouped by parent technique node ID
  const parentToSubtechniques = useMemo(() => {
    const subs: Record<string, GraphNode[]> = {}
    edges.forEach(e => {
      if (e.type === 'parent_of') {
        if (!subs[e.source]) subs[e.source] = []
        const childNode = techniqueNodesMap.get(e.target)
        if (childNode) {
          subs[e.source].push(childNode)
        }
      }
    })
    return subs
  }, [edges, techniqueNodesMap])

  const handleZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(Math.max(prev + delta, 0.6), 1.8))
  }

  const handleResetZoom = () => {
    setZoomLevel(1)
  }

  return (
    <div className="space-y-4">
      {/* Graph Toolbar & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900 border border-gray-800 p-3.5 rounded-lg text-xs">
        {/* Controls */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-gray-950 border border-gray-800 rounded p-0.5">
            <button
              onClick={() => handleZoom(0.15)}
              className="px-2.5 py-1 text-gray-300 hover:text-white hover:bg-gray-800 rounded font-bold"
              title="Zoom In"
            >
              +
            </button>
            <span className="px-2 font-mono text-[11px] text-gray-400">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => handleZoom(-0.15)}
              className="px-2.5 py-1 text-gray-300 hover:text-white hover:bg-gray-800 rounded font-bold"
              title="Zoom Out"
            >
              -
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 py-1 text-[11px] text-gray-400 hover:text-white hover:bg-gray-800 rounded border-l border-gray-800"
              title="Reset Zoom to 100%"
            >
              Fit
            </button>
          </div>

          <button
            onClick={() => setFilterEvidenceOnly(!filterEvidenceOnly)}
            className={`px-3 py-1.5 rounded border transition-colors font-medium ${
              filterEvidenceOnly
                ? 'bg-red-950/80 border-red-500 text-red-200'
                : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {filterEvidenceOnly ? '★ Showing Mapped Evidence Only' : 'Show All Techniques'}
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-gray-400 text-[11px]">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-blue-900 border border-blue-500" />
            <span>Tactic Node</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-gray-800 border border-gray-600" />
            <span>Technique</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-gray-900 border border-dashed border-gray-600" />
            <span>Sub-technique</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-red-950 border border-red-500" />
            <span className="text-red-300 font-semibold">Observed Evidence</span>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas and Side Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Interactive Matrix Hierarchy Canvas */}
        <div className="lg:col-span-3 bg-gray-950 border border-gray-800 rounded-lg p-4 overflow-x-auto min-h-[550px] relative shadow-inner">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-96 text-gray-400 space-y-2">
              <span className="animate-spin text-2xl">⏳</span>
              <p className="text-sm">Generating MITRE ATT&CK Matrix Graph...</p>
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease-out'
              }}
              className="inline-flex gap-4 min-w-full pb-8"
            >
              {tacticNodes.map(tactic => {
                const techniques = tacticToTechniques[tactic.id] || []
                return (
                  <div
                    key={tactic.id}
                    className="w-56 shrink-0 flex flex-col space-y-2"
                  >
                    {/* Tactic Header Node */}
                    <div
                      onClick={() => setActiveNode(tactic)}
                      className="p-2.5 rounded-lg bg-blue-950/80 border border-blue-600/80 text-white shadow-md cursor-pointer hover:bg-blue-900 transition-colors"
                    >
                      <div className="text-[10px] text-blue-300 font-mono font-semibold">
                        {tactic.tactic_id}
                      </div>
                      <div className="text-xs font-bold truncate mt-0.5">
                        {tactic.label}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1 flex justify-between">
                        <span>{techniques.length} techniques</span>
                      </div>
                    </div>

                    {/* Technique Nodes Column */}
                    <div className="space-y-1.5">
                      {techniques.map(tech => {
                        const subs = parentToSubtechniques[tech.id] || []
                        const isSelected = activeNode?.id === tech.id
                        const hasEv = tech.has_evidence

                        return (
                          <div key={tech.id} className="space-y-1">
                            {/* Technique Box */}
                            <div
                              onClick={() => {
                                setActiveNode(tech)
                                if (tech.technique_id) onSelectTechnique(tech.technique_id)
                              }}
                              className={`p-2 rounded text-xs border transition-all cursor-pointer ${
                                isSelected
                                  ? 'ring-2 ring-blue-400 border-transparent shadow-lg scale-[1.02]'
                                  : ''
                              } ${
                                hasEv
                                  ? 'bg-red-950/60 border-red-700/80 text-white hover:bg-red-900/60'
                                  : 'bg-gray-900/90 border-gray-800 text-gray-200 hover:bg-gray-850 hover:border-gray-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] text-gray-400 font-semibold">
                                  {tech.technique_id}
                                </span>
                                {hasEv && (
                                  <span className="text-[9px] bg-red-900 text-red-200 px-1 rounded border border-red-600 font-bold">
                                    {tech.evidence_count} evidence
                                  </span>
                                )}
                              </div>
                              <div className="font-medium text-[11px] truncate mt-1">
                                {tech.name}
                              </div>
                            </div>

                            {/* Connected Sub-techniques (indented) */}
                            {subs.length > 0 && (
                              <div className="pl-3 border-l-2 border-gray-800 space-y-1">
                                {subs.map(sub => {
                                  const subSelected = activeNode?.id === sub.id
                                  const subHasEv = sub.has_evidence

                                  return (
                                    <div
                                      key={sub.id}
                                      onClick={() => {
                                        setActiveNode(sub)
                                        if (sub.technique_id) onSelectTechnique(sub.technique_id)
                                      }}
                                      className={`p-1.5 rounded text-[10px] border border-dashed transition-colors cursor-pointer ${
                                        subSelected
                                          ? 'ring-2 ring-blue-400 border-transparent bg-gray-800'
                                          : ''
                                      } ${
                                        subHasEv
                                          ? 'bg-red-950/40 border-red-700 text-red-200 hover:bg-red-900/50'
                                          : 'bg-gray-950/80 border-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-900'
                                      }`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <span className="font-mono">{sub.technique_id}</span>
                                        {subHasEv && (
                                          <span className="text-[8px] bg-red-900/80 text-red-200 px-1 rounded">
                                            {sub.evidence_count}
                                          </span>
                                        )}
                                      </div>
                                      <div className="truncate font-normal text-gray-300">
                                        {sub.name}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Node Details Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-800 pb-2">
            Graph Detail Panel
          </h3>

          {activeNode ? (
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                  {activeNode.type}
                </span>
                <h4 className="font-bold text-white text-sm mt-2 leading-snug">
                  {activeNode.label}
                </h4>
              </div>

              {activeNode.technique_id && (
                <div>
                  <span className="text-gray-400 block text-[11px]">MITRE Technique ID</span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">
                    {activeNode.technique_id}
                  </span>
                </div>
              )}

              {activeNode.tactics && activeNode.tactics.length > 0 && (
                <div>
                  <span className="text-gray-400 block text-[11px] mb-1">Associated Tactics</span>
                  <div className="flex flex-wrap gap-1">
                    {activeNode.tactics.map(t => (
                      <span key={t} className="bg-blue-950/70 text-blue-300 px-1.5 py-0.5 rounded text-[10px] border border-blue-800/40">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeNode.platforms && activeNode.platforms.length > 0 && (
                <div>
                  <span className="text-gray-400 block text-[11px]">Platforms</span>
                  <span className="text-gray-300 text-[11px]">
                    {activeNode.platforms.join(', ')}
                  </span>
                </div>
              )}

              {/* Evidence Status */}
              <div className={`p-2.5 rounded border ${
                activeNode.has_evidence 
                  ? 'bg-red-950/40 border-red-800/60 text-red-200'
                  : 'bg-gray-950 border-gray-800 text-gray-400'
              }`}>
                <div className="font-semibold text-xs flex items-center space-x-1.5">
                  <span>{activeNode.has_evidence ? '🛡️ Observed Evidence Found' : 'ℹ️ Catalog Only'}</span>
                </div>
                <p className="text-[11px] mt-1 text-gray-300">
                  {activeNode.has_evidence 
                    ? `${activeNode.evidence_count} detection rule, alert, or event mapping(s) associated with this technique.`
                    : 'No telemetry alerts or investigations currently mapped to this technique.'}
                </p>
              </div>

              {activeNode.technique_id && (
                <button
                  onClick={() => onSelectTechnique(activeNode.technique_id!)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
                >
                  View Full Technique Modal &rarr;
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500 text-xs">
              <p>Select any tactic, technique, or sub-technique node in the graph to inspect relationships and mapped security telemetry.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
