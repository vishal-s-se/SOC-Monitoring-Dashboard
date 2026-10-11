"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HELP_CATEGORIES, HelpCategory, HelpTopic } from "../../components/help/HelpData";
import { HelpSidebar } from "../../components/help/HelpSidebar";
import { HelpContent } from "../../components/help/HelpContent";

function HelpPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlCategory = searchParams.get("category");
  const urlTopic = searchParams.get("topic");

  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    urlCategory || "getting-started"
  );
  const [activeTopicId, setActiveTopicId] = useState<string>(
    urlTopic || "overview-mission"
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  // Sync state if URL query params change
  useEffect(() => {
    if (urlCategory) {
      setActiveCategoryId(urlCategory);
    }
    if (urlTopic) {
      setActiveTopicId(urlTopic);
    } else if (urlCategory) {
      const cat = HELP_CATEGORIES.find((c) => c.id === urlCategory);
      if (cat && cat.topics.length > 0) {
        setActiveTopicId(cat.topics[0].id);
      }
    }
  }, [urlCategory, urlTopic]);

  const handleSelectTopic = (catId: string, topicId: string) => {
    setActiveCategoryId(catId);
    setActiveTopicId(topicId);
    setMobileDrawerOpen(false);

    // Update URL query parameters cleanly without full reload
    const params = new URLSearchParams();
    params.set("category", catId);
    params.set("topic", topicId);
    router.replace(`/help?${params.toString()}`);
  };

  // Find active category and topic objects
  const activeCategory: HelpCategory =
    HELP_CATEGORIES.find((c) => c.id === activeCategoryId) ||
    HELP_CATEGORIES[0];

  const activeTopic: HelpTopic =
    activeCategory.topics.find((t) => t.id === activeTopicId) ||
    activeCategory.topics[0] || {
      id: "fallback",
      title: "Help Topic",
      summary: "Topic details",
      content: "Content not found.",
    };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-950 text-gray-100 overflow-hidden">
      {/* Top Banner / Breadcrumb & Controls Bar */}
      <div className="h-12 border-b border-gray-800 bg-gray-900/90 px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            className="md:hidden p-1.5 rounded-md bg-gray-800 text-gray-300 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-400 transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>
          <span className="text-gray-700 hidden sm:inline">|</span>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="font-semibold text-gray-200">SOC Monitor Help Center</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
              v1.0 Docs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-800/80 rounded border border-gray-700/80 hover:border-gray-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print Guide</span>
          </button>
        </div>
      </div>

      {/* Main Container: Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <HelpSidebar
            activeCategoryId={activeCategory.id}
            activeTopicId={activeTopic.id}
            onSelectTopic={handleSelectTopic}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        {/* Mobile Drawer */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-4/5 max-w-xs h-full z-10 bg-gray-950 flex flex-col shadow-2xl">
              <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                <span className="text-xs font-bold text-gray-200">Table of Contents</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="text-gray-400 hover:text-white p-1"
                >
                  ✕
                </button>
              </div>
              <HelpSidebar
                activeCategoryId={activeCategory.id}
                activeTopicId={activeTopic.id}
                onSelectTopic={handleSelectTopic}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>
          </div>
        )}

        {/* Scrollable Content Pane */}
        <main className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
          <HelpContent
            category={activeCategory}
            topic={activeTopic}
            onNavigateTopic={handleSelectTopic}
          />
        </main>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
          Loading Help Center...
        </div>
      }
    >
      <HelpPageInner />
    </Suspense>
  );
}
