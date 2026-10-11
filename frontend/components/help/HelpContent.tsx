"use client";

import React from "react";
import { HelpCategory, HelpTopic, HELP_CATEGORIES } from "./HelpData";
import { CopyButton } from "./CopyButton";
import {
  ArchitectureDiagram,
  EventPipelineDiagram,
  InvestigationWorkflowDiagram,
} from "./HelpDiagrams";
import { TroubleshootingLibrary } from "./TroubleshootingLibrary";
import { GlossarySection } from "./GlossarySection";
import { FAQSection } from "./FAQSection";

interface HelpContentProps {
  category: HelpCategory;
  topic: HelpTopic;
  onNavigateTopic: (categoryId: string, topicId: string) => void;
}

export function HelpContent({
  category,
  topic,
  onNavigateTopic,
}: HelpContentProps) {
  // Find current topic index and adjacent topics for next/prev navigation
  const allFlattenedTopics: { catId: string; catTitle: string; topic: HelpTopic }[] = [];
  HELP_CATEGORIES.forEach((cat) => {
    cat.topics.forEach((t) => {
      allFlattenedTopics.push({ catId: cat.id, catTitle: cat.title, topic: t });
    });
  });

  const currentIndex = allFlattenedTopics.findIndex(
    (item) => item.catId === category.id && item.topic.id === topic.id
  );
  const prevTopic = currentIndex > 0 ? allFlattenedTopics[currentIndex - 1] : null;
  const nextTopic =
    currentIndex < allFlattenedTopics.length - 1
      ? allFlattenedTopics[currentIndex + 1]
      : null;

  // Simple, robust markdown-like line renderer
  const renderFormattedContent = (rawText: string) => {
    const lines = rawText.trim().split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLang = "";

    lines.forEach((line, idx) => {
      // Code block start / end
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          const codeContent = codeBuffer.join("\n");
          elements.push(
            <div
              key={`code-${idx}`}
              className="my-3 rounded-lg bg-gray-950 border border-gray-800 overflow-hidden text-xs shadow-inner"
            >
              <div className="bg-gray-900/90 px-3 py-1.5 border-b border-gray-800 text-[11px] font-mono text-gray-400 flex items-center justify-between">
                <span>{codeLang || "bash / powershell"}</span>
                <CopyButton text={codeContent} label="Copy snippet" />
              </div>
              <pre className="p-3 text-emerald-400 font-mono text-xs overflow-x-auto select-text leading-relaxed">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
          codeBuffer = [];
          inCodeBlock = false;
          codeLang = "";
        } else {
          inCodeBlock = true;
          codeLang = line.trim().replace("```", "").trim();
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      const trimmed = line.trim();

      // Heading 3
      if (trimmed.startsWith("### ")) {
        elements.push(
          <h3
            key={`h3-${idx}`}
            className="text-base sm:text-lg font-bold text-gray-100 mt-6 mb-2 border-b border-gray-800/80 pb-1.5"
          >
            {trimmed.replace("### ", "")}
          </h3>
        );
        return;
      }

      // Heading 4
      if (trimmed.startsWith("#### ")) {
        elements.push(
          <h4
            key={`h4-${idx}`}
            className="text-sm sm:text-base font-semibold text-blue-400 mt-4 mb-1.5"
          >
            {trimmed.replace("#### ", "")}
          </h4>
        );
        return;
      }

      // Callout box (> [!NOTE], > [!WARNING], > [!IMPORTANT], > [!TIP])
      if (trimmed.startsWith("> [!NOTE]") || trimmed.startsWith("> [!IMPORTANT]") || trimmed.startsWith("> [!WARNING]") || trimmed.startsWith("> [!TIP]")) {
        const type = trimmed.includes("NOTE")
          ? "NOTE"
          : trimmed.includes("WARNING")
          ? "WARNING"
          : trimmed.includes("TIP")
          ? "TIP"
          : "IMPORTANT";

        const bg =
          type === "WARNING"
            ? "bg-amber-950/20 border-amber-900/60 text-amber-300"
            : type === "TIP"
            ? "bg-emerald-950/20 border-emerald-900/60 text-emerald-300"
            : type === "IMPORTANT"
            ? "bg-red-950/20 border-red-900/60 text-red-300"
            : "bg-blue-950/20 border-blue-900/60 text-blue-300";

        elements.push(
          <div
            key={`callout-${idx}`}
            className={`my-3 p-3 rounded-lg border text-xs leading-relaxed ${bg}`}
          >
            <div className="font-bold uppercase tracking-wider text-[10px] mb-1">
              {type}
            </div>
            {trimmed.replace(/^> \[[!A-Z]+\]\s*/, "")}
          </div>
        );
        return;
      }

      if (trimmed.startsWith("> ")) {
        elements.push(
          <blockquote
            key={`quote-${idx}`}
            className="my-2 pl-3 border-l-2 border-gray-700 text-xs text-gray-400 italic"
          >
            {trimmed.replace(/^> /, "")}
          </blockquote>
        );
        return;
      }

      // List item
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const text = trimmed.substring(2);
        elements.push(
          <li key={`li-${idx}`} className="text-xs sm:text-sm text-gray-300 ml-4 list-disc my-1">
            {renderInlineMarkdown(text)}
          </li>
        );
        return;
      }

      // Numbered list item
      if (/^\d+\.\s/.test(trimmed)) {
        const text = trimmed.replace(/^\d+\.\s/, "");
        elements.push(
          <li key={`nli-${idx}`} className="text-xs sm:text-sm text-gray-300 ml-4 list-decimal my-1">
            {renderInlineMarkdown(text)}
          </li>
        );
        return;
      }

      // Blank line
      if (trimmed === "") {
        elements.push(<div key={`blank-${idx}`} className="h-2" />);
        return;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${idx}`} className="text-xs sm:text-sm text-gray-300 leading-relaxed my-1.5">
          {renderInlineMarkdown(line)}
        </p>
      );
    });

    return elements;
  };

  // Inline formatting: **bold** and `code`
  const renderInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="text-gray-100 font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="bg-gray-800/80 text-blue-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-gray-700/60"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <article className="flex-1 max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-8">
      {/* Category & Topic Title Header */}
      <header className="space-y-3 pb-6 border-b border-gray-800">
        <div className="flex items-center gap-2 text-xs text-blue-400 font-medium">
          <span>{category.shortTitle}</span>
          <span>/</span>
          <span className="text-gray-400">{topic.title}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {topic.title}
          </h1>
          {topic.badge && (
            <span className="inline-flex self-start sm:self-auto text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-blue-900/50 text-blue-400 border border-blue-800">
              {topic.badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">
          {topic.summary}
        </p>
      </header>

      {/* Embedded Rich Diagrams based on topic id */}
      {topic.id === "architecture-dataflow" && (
        <section className="space-y-3">
          <ArchitectureDiagram />
        </section>
      )}

      {topic.id === "event-pipeline" && (
        <section className="space-y-3">
          <EventPipelineDiagram />
        </section>
      )}

      {topic.id === "investigation-lifecycle" && (
        <section className="space-y-3">
          <InvestigationWorkflowDiagram />
        </section>
      )}

      {/* Special Interactive Views */}
      {topic.id === "troubleshooting-library" ? (
        <TroubleshootingLibrary />
      ) : topic.id === "soc-glossary" ? (
        <GlossarySection
          onSelectTopic={(tId) => {
            // Find category for topic
            const foundCat = HELP_CATEGORIES.find((c) =>
              c.topics.some((t) => t.id === tId)
            );
            if (foundCat) onNavigateTopic(foundCat.id, tId);
          }}
        />
      ) : topic.id === "faq-section" ? (
        <FAQSection
          onSelectTopic={(tId) => {
            const foundCat = HELP_CATEGORIES.find((c) =>
              c.topics.some((t) => t.id === tId)
            );
            if (foundCat) onNavigateTopic(foundCat.id, tId);
          }}
        />
      ) : (
        /* Standard Topic Content */
        <section className="prose prose-invert max-w-none text-gray-300 space-y-2">
          {renderFormattedContent(topic.content)}
        </section>
      )}

      {/* Quick Diagnostic Commands if attached to topic */}
      {topic.commands && topic.commands.length > 0 && (
        <section className="mt-8 pt-6 border-t border-gray-800 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Verified Diagnostic Commands
          </h3>
          <div className="grid grid-cols-1 gap-2.5">
            {topic.commands.map((cmd, idx) => (
              <div
                key={idx}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs text-gray-300 font-medium">
                  <span>{cmd.label}</span>
                  {cmd.platform && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                      {cmd.platform}
                    </span>
                  )}
                </div>
                <div className="bg-black/60 border border-gray-800 rounded px-2.5 py-1.5 font-mono text-xs text-emerald-400 flex items-center justify-between gap-2 overflow-x-auto">
                  <span className="select-all">{cmd.cmd}</span>
                  <CopyButton text={cmd.cmd} label="Copy command" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related Topics Links */}
      {topic.relatedTopicIds && topic.relatedTopicIds.length > 0 && (
        <section className="pt-6 border-t border-gray-800 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Related Topics
          </h4>
          <div className="flex flex-wrap gap-2">
            {topic.relatedTopicIds.map((rId) => {
              const matched = allFlattenedTopics.find((t) => t.topic.id === rId);
              if (!matched) return null;
              return (
                <button
                  key={rId}
                  onClick={() => onNavigateTopic(matched.catId, matched.topic.id)}
                  className="px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-xs text-blue-400 font-medium transition-colors flex items-center gap-1.5"
                >
                  <span>{matched.topic.title}</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Next / Previous Topic Navigation Footer */}
      <footer className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        {prevTopic ? (
          <button
            onClick={() => onNavigateTopic(prevTopic.catId, prevTopic.topic.id)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-left transition-colors group"
          >
            <div className="text-[10px] text-gray-500 uppercase font-semibold">
              ← Previous Topic
            </div>
            <div className="text-xs font-semibold text-gray-200 group-hover:text-blue-400 truncate max-w-xs">
              {prevTopic.topic.title}
            </div>
          </button>
        ) : (
          <div />
        )}

        {nextTopic ? (
          <button
            onClick={() => onNavigateTopic(nextTopic.catId, nextTopic.topic.id)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-right transition-colors group"
          >
            <div className="text-[10px] text-gray-500 uppercase font-semibold">
              Next Topic →
            </div>
            <div className="text-xs font-semibold text-gray-200 group-hover:text-blue-400 truncate max-w-xs">
              {nextTopic.topic.title}
            </div>
          </button>
        ) : (
          <div />
        )}
      </footer>
    </article>
  );
}
