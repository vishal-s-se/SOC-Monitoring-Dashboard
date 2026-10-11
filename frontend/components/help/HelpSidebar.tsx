"use client";

import React, { useState } from "react";
import { HELP_CATEGORIES, HelpCategory, HelpTopic } from "./HelpData";

interface HelpSidebarProps {
  activeCategoryId: string;
  activeTopicId: string;
  onSelectTopic: (categoryId: string, topicId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function HelpSidebar({
  activeCategoryId,
  activeTopicId,
  onSelectTopic,
  searchQuery,
  onSearchChange,
}: HelpSidebarProps) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    [activeCategoryId]: true,
  });

  const toggleCategory = (catId: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Check if topic or category matches global search query
  const matchesSearch = (cat: HelpCategory, topic?: HelpTopic): boolean => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (topic) {
      return (
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.content.toLowerCase().includes(q)
      );
    }
    return (
      cat.title.toLowerCase().includes(q) ||
      cat.description.toLowerCase().includes(q) ||
      cat.topics.some((t) => matchesSearch(cat, t))
    );
  };

  return (
    <aside className="w-full md:w-72 lg:w-80 shrink-0 bg-gray-950/80 border-r border-gray-800 flex flex-col h-full overflow-hidden">
      {/* Search Header */}
      <div className="p-4 border-b border-gray-800 bg-gray-950/90 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </span>
            <span className="font-bold text-gray-100 text-sm tracking-tight">Help & Documentation</span>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search topics, symptoms, commands..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700/80 rounded-md pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          <svg
            className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-200 text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Quick Nav Presets */}
      <div className="p-3 border-b border-gray-800/80 bg-gray-950/40 grid grid-cols-2 gap-1.5 text-xs">
        <button
          onClick={() => onSelectTopic("getting-started", "architecture-dataflow")}
          className="px-2 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 hover:border-gray-700 flex items-center gap-1.5 font-medium transition-colors text-[11px]"
        >
          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Architecture
        </button>
        <button
          onClick={() => onSelectTopic("troubleshooting", "troubleshooting-library")}
          className="px-2 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 hover:border-gray-700 flex items-center gap-1.5 font-medium transition-colors text-[11px]"
        >
          <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Diagnostics
        </button>
        <button
          onClick={() => onSelectTopic("glossary-faq", "soc-glossary")}
          className="px-2 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 hover:border-gray-700 flex items-center gap-1.5 font-medium transition-colors text-[11px]"
        >
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Glossary (30+)
        </button>
        <button
          onClick={() => onSelectTopic("glossary-faq", "faq-section")}
          className="px-2 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-800 hover:border-gray-700 flex items-center gap-1.5 font-medium transition-colors text-[11px]"
        >
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          FAQ
        </button>
      </div>

      {/* Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-800">
        {HELP_CATEGORIES.map((cat) => {
          const visible = matchesSearch(cat);
          if (!visible) return null;

          const isOpen = openCategories[cat.id] || searchQuery.length > 0;
          const isCategoryActive = activeCategoryId === cat.id;

          return (
            <div key={cat.id} className="rounded-lg overflow-hidden">
              <button
                onClick={() => {
                  toggleCategory(cat.id);
                  if (cat.topics.length > 0) {
                    onSelectTopic(cat.id, cat.topics[0].id);
                  }
                }}
                className={`w-full text-left px-2.5 py-2 rounded-md flex items-center justify-between text-xs font-semibold transition-colors ${
                  isCategoryActive
                    ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                    : "text-gray-300 hover:text-white hover:bg-gray-900"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="truncate">{cat.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span className="text-[10px] px-1.5 py-0.2 bg-gray-800 text-gray-400 rounded-full font-mono">
                    {cat.topics.length}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="pl-3 py-1 space-y-0.5 border-l border-gray-800/80 ml-3.5 my-1">
                  {cat.topics.map((topic) => {
                    if (!matchesSearch(cat, topic)) return null;
                    const isTopicActive =
                      isCategoryActive && activeTopicId === topic.id;

                    return (
                      <button
                        key={topic.id}
                        onClick={() => onSelectTopic(cat.id, topic.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] leading-tight flex items-center justify-between gap-1 transition-colors ${
                          isTopicActive
                            ? "bg-blue-600 text-white font-medium shadow-sm"
                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-900/60"
                        }`}
                      >
                        <span className="truncate">{topic.title}</span>
                        {topic.badge && (
                          <span
                            className={`text-[9px] uppercase px-1 py-0.2 rounded shrink-0 ${
                              isTopicActive
                                ? "bg-blue-800 text-blue-100"
                                : "bg-gray-800 text-gray-400"
                            }`}
                          >
                            {topic.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
