import React from "react"

interface Props {
  technique: any
  onClose: () => void
  onMappingCreated?: () => void
}

export function MitreTechniqueDetailsModal({ technique, onClose }: Props) {
  if (!technique) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-[#121620]">
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-1 bg-red-950/80 border border-red-700/60 text-red-300 font-mono text-xs font-bold rounded">
              {technique.technique_id}
            </span>
            <h3 className="text-lg font-bold text-white tracking-wide">{technique.name}</h3>
            {technique.is_subtechnique && (
              <span className="text-[11px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                Sub-technique
              </span>
            )}
            {technique.is_deprecated && (
              <span className="text-[11px] bg-yellow-950 text-yellow-400 px-2 py-0.5 rounded border border-yellow-700">
                Deprecated
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg text-sm p-1.5 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[#151922] rounded-lg border border-gray-800">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">ATT&CK Domain</p>
              <p className="text-sm text-gray-200 mt-1 font-medium">Enterprise</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Dataset Version</p>
              <p className="text-sm text-gray-200 mt-1 font-medium">{technique.dataset_version || 'v14.1'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Parent Technique</p>
              <p className="text-sm text-gray-200 mt-1 font-mono">
                {technique.parent_technique ? (
                  <span>{technique.parent_technique.technique_id} - {technique.parent_technique.name}</span>
                ) : technique.parent_technique_id ? (
                  <span>{technique.parent_technique_id}</span>
                ) : (
                  <span className="text-gray-500">None (Top-level)</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Tactics</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {technique.tactics && technique.tactics.length > 0 ? (
                  technique.tactics.map((t: any) => (
                    <span key={t.tactic_id} className="text-xs bg-blue-950/80 border border-blue-800/60 text-blue-300 px-2 py-0.5 rounded">
                      {t.name}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500 text-xs">None</span>
                )}
              </div>
            </div>
          </div>

          {/* Platforms & Data Sources */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Supported Platforms</p>
              <div className="flex flex-wrap gap-1.5">
                {technique.platforms && technique.platforms.length > 0 ? (
                  technique.platforms.map((p: string) => (
                    <span key={p} className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded border border-gray-700">
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500 text-xs">Not specified</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Data Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {technique.data_sources && technique.data_sources.length > 0 ? (
                  technique.data_sources.map((ds: string) => (
                    <span key={ds} className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded border border-gray-700">
                      {ds}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-500 text-xs">Not specified</span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Description</h4>
            <div className="p-4 bg-[#151922] rounded-lg border border-gray-800 text-gray-300 leading-relaxed whitespace-pre-wrap">
              {technique.description || "No description provided in catalog."}
            </div>
          </div>

          {/* Sub-techniques list */}
          {technique.subtechniques && technique.subtechniques.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Sub-Techniques ({technique.subtechniques.length})
              </h4>
              <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden bg-[#151922]">
                {technique.subtechniques.map((sub: any) => (
                  <div key={sub.technique_id} className="p-3 flex items-center justify-between hover:bg-gray-800/40">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-red-300 font-semibold">{sub.technique_id}</span>
                      <span className="text-gray-200 text-sm">{sub.name}</span>
                    </div>
                    {sub.platforms && (
                      <span className="text-xs text-gray-500">
                        {sub.platforms.join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Traceable Evidence Relationships (Actual SOC entities mapped to this technique) */}
          <div className="space-y-4 pt-2 border-t border-gray-800">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Mapped SOC Entities (Traceable Evidence)
            </h4>

            {/* Detection Rules */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-400">
                Detection Rules ({technique.detection_rules ? technique.detection_rules.length : 0})
              </span>
              {technique.detection_rules && technique.detection_rules.length > 0 ? (
                <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg bg-[#151922]">
                  {technique.detection_rules.map((r: any) => (
                    <div key={r.mapping_id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-blue-400 mr-2">{r.rule_id || `Rule #${r.id}`}</span>
                        <span className="text-white text-sm">{r.name || 'Detection Rule'}</span>
                        <span className="text-xs text-gray-500 ml-2">[{r.severity || 'N/A'}]</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                          {r.mapping_source}
                        </span>
                        <span className="text-gray-500">Conf: {r.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No detection rules mapped.</p>
              )}
            </div>

            {/* Alerts */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-400">
                Alerts ({technique.alerts ? technique.alerts.length : 0})
              </span>
              {technique.alerts && technique.alerts.length > 0 ? (
                <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg bg-[#151922]">
                  {technique.alerts.map((a: any) => (
                    <div key={a.mapping_id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-yellow-400 mr-2">{a.alert_id || `Alert #${a.id}`}</span>
                        <span className="text-white text-sm">{a.title || 'Alert'}</span>
                        <span className="text-xs text-gray-500 ml-2">[{a.severity || 'N/A'}]</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                          {a.mapping_source}
                        </span>
                        <span className="text-gray-500">Conf: {a.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No alerts mapped.</p>
              )}
            </div>

            {/* Investigations */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-400">
                Investigations ({technique.investigations ? technique.investigations.length : 0})
              </span>
              {technique.investigations && technique.investigations.length > 0 ? (
                <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg bg-[#151922]">
                  {technique.investigations.map((i: any) => (
                    <div key={i.mapping_id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-blue-400 mr-2">INV-{i.id}</span>
                        <span className="text-white text-sm">{i.title}</span>
                        <span className="text-xs text-gray-500 ml-2">[{i.status}]</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded">
                          {i.mapping_source}
                        </span>
                        <span className="text-gray-500">Conf: {i.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No investigations mapped.</p>
              )}
            </div>

            {/* Events */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-400">
                Events ({technique.events ? technique.events.length : 0})
              </span>
              {technique.events && technique.events.length > 0 ? (
                <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg bg-[#151922]">
                  {technique.events.map((e: any) => (
                    <div key={e.mapping_id} className="p-3 flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-purple-400 mr-2">Event #{e.id}</span>
                        <span className="text-white text-sm">{e.event_type}</span>
                        <span className="text-xs text-gray-500 ml-2">Host: {e.hostname || 'N/A'}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                          {e.mapping_source}
                        </span>
                        <span className="text-gray-500">Conf: {e.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No events mapped.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-[#121620] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
