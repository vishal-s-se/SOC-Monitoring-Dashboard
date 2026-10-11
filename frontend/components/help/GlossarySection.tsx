"use client";

import React, { useState, useMemo } from "react";
import { GLOSSARY_ITEMS, GlossaryItem } from "./HelpData";

interface GlossarySectionProps {
  onSelectTopic?: (topicId: string) => void;
}

export function GlossarySection({ onSelectTopic }: GlossarySectionProps) {
  const [selectedLetter, setSelectedLetter] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const alphabet = useMemo(() => {
    const letters = new Set<string>();
    GLOSSARY_ITEMS.forEach((item) => {
      letters.add(item.term.charAt(0).toUpperCase());
    });
    return Array.from(letters).sort();
  }, []);

  const filteredItems = useMemo(() => {
    return GLOSSARY_ITEMS.filter((item) => {
      if (
        selectedLetter !== "all" &&
        item.term.charAt(0).toUpperCase() !== selectedLetter
      ) {
        return false;
      }
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        item.term.toLowerCase().includes(q) ||
        item.definition.toLowerCase().includes(q) ||
        item.practicalExample.toLowerCase().includes(q)
      );
    });
  }, [selectedLetter, selectedCategory, searchQuery]);

  const getCategoryBadge = (cat: GlossaryItem["category"]) => {
    switch (cat) {
      case "windows":
        return "bg-blue-900/40 text-blue-400 border-blue-800";
      case "linux":
        return "bg-orange-900/40 text-orange-400 border-orange-800";
      case "detection":
        return "bg-red-900/40 text-red-400 border-red-800";
      case "investigation":
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
              placeholder="Search glossary terms, definitions, practical examples..."
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
            Showing <span className="text-blue-400 font-bold">{filteredItems.length}</span> of {GLOSSARY_ITEMS.length} terms
          </div>
        </div>

        {/* Letter Selector */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-800/80 pt-3">
          <button
            onClick={() => setSelectedLetter("all")}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              selectedLetter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-800/60 text-gray-400 hover:text-gray-200"
            }`}
          >
            All
          </button>
          {alphabet.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(letter)}
              className={`w-7 h-7 rounded flex items-center justify-center text-xs font-semibold transition-all ${
                selectedLetter === letter
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-800/60">
          {[
            { id: "all", label: "All Categories" },
            { id: "core", label: "Core SOC" },
            { id: "windows", label: "Windows Specific" },
            { id: "linux", label: "Linux Specific" },
            { id: "detection", label: "Detection & Threat" },
            { id: "investigation", label: "Investigation" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                selectedCategory === cat.id
                  ? "bg-gray-700 text-white shadow-sm"
                  : "bg-gray-800/50 text-gray-400 hover:text-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terms Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center text-gray-400">
          <p className="font-semibold text-gray-300">No matching glossary terms found</p>
          <p className="text-xs text-gray-500 mt-1">
            Try clearing search filters or selecting &quot;All&quot;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item, idx) => (
            <div
              key={idx}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 hover:border-gray-700 transition-colors shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-100">{item.term}</h4>
                <span
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${getCategoryBadge(
                    item.category
                  )}`}
                >
                  {item.category}
                </span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                {item.definition}
              </p>
              <div className="bg-gray-950/70 border border-gray-800/80 rounded p-2.5 text-xs text-gray-400">
                <span className="font-semibold text-blue-400 block mb-0.5">
                  In SOC Monitor:
                </span>
                {item.practicalExample}
              </div>
              {item.relatedTopicId && onSelectTopic && (
                <div className="pt-1">
                  <button
                    onClick={() => onSelectTopic(item.relatedTopicId!)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                  >
                    <span>Read related guide</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
