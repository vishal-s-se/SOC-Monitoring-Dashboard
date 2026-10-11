"use client";

import React, { useState, useMemo } from "react";
import { TROUBLESHOOTING_ITEMS, TroubleshootingItem } from "./HelpData";
import { CopyButton } from "./CopyButton";

export function TroubleshootingLibrary() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return TROUBLESHOOTING_ITEMS.filter((item) => {
      const matchPlatform =
        selectedPlatform === "all" || item.platform === selectedPlatform;
      if (!matchPlatform) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const inSymptom = item.symptom.toLowerCase().includes(q);
      const inCauses = item.possibleCauses.some((c) =>
        c.toLowerCase().includes(q)
      );
      const inFix =
        item.safeFix.title.toLowerCase().includes(q) ||
        item.safeFix.steps.some((s) => s.toLowerCase().includes(q));
      const inSteps = item.diagnosticSteps.some(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          (s.command && s.command.toLowerCase().includes(q))
      );

      return inSymptom || inCauses || inFix || inSteps;
    });
  }, [selectedPlatform, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getPlatformBadge = (platform: TroubleshootingItem["platform"]) => {
    switch (platform) {
      case "windows":
        return "bg-blue-900/40 text-blue-400 border-blue-800";
      case "linux":
        return "bg-orange-900/40 text-orange-400 border-orange-800";
      case "backend":
        return "bg-emerald-900/40 text-emerald-400 border-emerald-800";
      case "collector":
        return "bg-cyan-900/40 text-cyan-400 border-cyan-800";
      case "network":
        return "bg-purple-900/40 text-purple-400 border-purple-800";
      default:
        return "bg-gray-800 text-gray-400 border-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-lg p-4 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search symptoms, errors, diagnostic commands, or fixes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-xs text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-xs text-gray-400 font-medium px-1">
            Showing <span className="text-blue-400 font-bold">{filteredItems.length}</span> of {TROUBLESHOOTING_ITEMS.length} guides
          </div>
        </div>

        {/* Platform Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { id: "all", label: "All Scenarios" },
            { id: "windows", label: "Windows Agent" },
            { id: "linux", label: "Linux / Kali" },
            { id: "collector", label: "Collector (Port 5000)" },
            { id: "backend", label: "Backend API (Port 8000)" },
            { id: "network", label: "Network & Sockets" },
            { id: "general", label: "General & Auth" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedPlatform(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedPlatform === tab.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-800/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Troubleshooting Items List */}
      {filteredItems.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="font-semibold text-gray-300">No matching troubleshooting guides found</p>
          <p className="text-xs text-gray-500 mt-1">
            Try broadening your search term or select &quot;All Scenarios&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg overflow-hidden transition-colors shadow-sm"
              >
                {/* Header / Accordion trigger */}
                <div
                  onClick={() => toggleExpand(item.id)}
                  className="p-4 cursor-pointer flex items-start justify-between gap-4 select-none"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${getPlatformBadge(
                          item.platform
                        )}`}
                      >
                        {item.platform}
                      </span>
                      <h4 className="text-sm font-semibold text-gray-100 leading-snug">
                        {item.symptom}
                      </h4>
                    </div>
                    <div className="text-xs text-gray-400 line-clamp-1">
                      Causes: {item.possibleCauses.join("; ")}
                    </div>
                  </div>
                  <button
                    className="p-1 rounded text-gray-400 hover:text-gray-200 shrink-0"
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <svg
                      className={`w-5 h-5 transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-800/80 p-4 sm:p-5 bg-gray-950/40 space-y-5 text-sm">
                    {/* Possible Causes */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Possible Root Causes
                      </h5>
                      <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                        {item.possibleCauses.map((cause, i) => (
                          <li key={i}>{cause}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Diagnostic Steps */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2.5 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Diagnostic Steps
                      </h5>
                      <div className="space-y-2.5">
                        {item.diagnosticSteps.map((step, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-900 border border-gray-800 rounded p-3 text-xs space-y-1.5"
                          >
                            <div className="font-semibold text-gray-200">
                              {idx + 1}. {step.label}
                            </div>
                            <div className="text-gray-400">{step.explanation}</div>
                            {step.command && (
                              <div className="mt-2 bg-black/60 border border-gray-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-emerald-400 flex items-center justify-between gap-2 overflow-x-auto">
                                <span className="select-all break-all">{step.command}</span>
                                <CopyButton text={step.command} label="Copy command" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Safe Fix */}
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Safe Fix: {item.safeFix.title}
                      </h5>
                      <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3 space-y-2 text-xs">
                        <ul className="list-decimal list-inside space-y-1 text-gray-300">
                          {item.safeFix.steps.map((st, i) => (
                            <li key={i}>{st}</li>
                          ))}
                        </ul>
                        {item.safeFix.command && (
                          <div className="mt-2 bg-black/60 border border-emerald-900/60 rounded px-2.5 py-1.5 font-mono text-[11px] text-emerald-300 flex items-center justify-between gap-2 overflow-x-auto">
                            <span className="select-all break-all">{item.safeFix.command}</span>
                            <CopyButton text={item.safeFix.command} label="Copy fix command" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Verification & Escalation */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="bg-gray-900 border border-gray-800 rounded p-3 text-xs">
                        <div className="font-semibold text-gray-300 mb-1 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                          Verification
                        </div>
                        <p className="text-gray-400">{item.verification}</p>
                      </div>
                      <div className="bg-gray-900 border border-gray-800 rounded p-3 text-xs">
                        <div className="font-semibold text-gray-300 mb-1 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400"></span>
                          When to Escalate
                        </div>
                        <p className="text-gray-400">{item.escalation}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
