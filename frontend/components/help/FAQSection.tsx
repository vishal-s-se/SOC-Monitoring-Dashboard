"use client";

import React, { useState, useMemo } from "react";
import { FAQ_ITEMS } from "./HelpData";

interface FAQSectionProps {
  onSelectTopic?: (topicId: string) => void;
}

export function FAQSection({ onSelectTopic }: FAQSectionProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0, 1]));

  const categories = useMemo(() => {
    const set = new Set<string>();
    FAQ_ITEMS.forEach((f) => set.add(f.category));
    return ["all", ...Array.from(set)];
  }, []);

  const filteredItems = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const toggleExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIndices(new Set(filteredItems.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedIndices(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-lg p-4 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search frequently asked questions..."
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
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 bg-gray-800 rounded transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 bg-gray-800 rounded transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800/80">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                selectedCategory === cat
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {cat === "all" ? "All Questions" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Accordion FAQ list */}
      {filteredItems.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="font-semibold text-gray-300">No questions matched your search</p>
          <p className="text-xs text-gray-500 mt-1">
            Try searching with broader terms or check the Troubleshooting Library.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item, idx) => {
            const isExpanded = expandedIndices.has(idx);
            return (
              <div
                key={idx}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg overflow-hidden transition-colors shadow-sm"
              >
                <button
                  onClick={() => toggleExpand(idx)}
                  className="w-full text-left p-4 flex items-start justify-between gap-4 select-none"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 inline-block mb-1">
                      {item.category}
                    </span>
                    <h4 className="text-sm font-semibold text-gray-100 leading-snug">
                      {item.question}
                    </h4>
                  </div>
                  <span className="p-1 text-gray-400 shrink-0">
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
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-800/80 bg-gray-950/40 text-xs sm:text-sm text-gray-300 leading-relaxed space-y-3">
                    <p>{item.answer}</p>
                    {item.relatedTopicId && onSelectTopic && (
                      <div className="pt-1">
                        <button
                          onClick={() => onSelectTopic(item.relatedTopicId!)}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                        >
                          <span>Explore detailed topic</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}
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
