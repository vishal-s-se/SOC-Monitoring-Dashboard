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

  // Inline formatting: **bold**, `code`, *italic*
  const renderInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="text-gray-100 font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
        return (
          <em key={i} className="text-gray-200 italic">
            {part.slice(1, -1)}
          </em>
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

  // Simple, robust markdown block renderer
  const renderFormattedContent = (rawText: string) => {
    const lines = rawText.trim().split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;
    const n = lines.length;

    while (i < n) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Code block
      if (trimmed.startsWith("```")) {
        const codeLang = trimmed.replace("```", "").trim();
        const codeBuffer: string[] = [];
        i++;
        while (i < n && !lines[i].trim().startsWith("```")) {
          codeBuffer.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        const codeContent = codeBuffer.join("\n");
        elements.push(
          <div
            key={`code-${i}`}
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
        continue;
      }

      // 2. Headings
      if (trimmed.startsWith("### ")) {
        elements.push(
          <h3
            key={`h3-${i}`}
            className="text-base sm:text-lg font-bold text-gray-100 mt-6 mb-2 border-b border-gray-800/80 pb-1.5"
          >
            {trimmed.replace("### ", "")}
          </h3>
        );
        i++;
        continue;
      }

      if (trimmed.startsWith("#### ")) {
        elements.push(
          <h4
            key={`h4-${i}`}
            className="text-sm sm:text-base font-semibold text-blue-400 mt-4 mb-1.5"
          >
            {trimmed.replace("#### ", "")}
          </h4>
        );
        i++;
        continue;
      }

      // 3. Callout box (> [!NOTE], > [!WARNING], > [!IMPORTANT], > [!TIP])
      if (
        trimmed.startsWith("> [!NOTE]") ||
        trimmed.startsWith("> [!IMPORTANT]") ||
        trimmed.startsWith("> [!WARNING]") ||
        trimmed.startsWith("> [!TIP]")
      ) {
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
            key={`callout-${i}`}
            className={`my-3 p-3 rounded-lg border text-xs leading-relaxed ${bg}`}
          >
            <div className="font-bold uppercase tracking-wider text-[10px] mb-1">
              {type}
            </div>
            {trimmed.replace(/^> \[[!A-Z]+\]\s*/, "")}
          </div>
        );
        i++;
        continue;
      }

      // 4. Blockquote
      if (trimmed.startsWith("> ")) {
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className="my-2 pl-3 border-l-2 border-gray-700 text-xs text-gray-400 italic"
          >
            {trimmed.replace(/^> /, "")}
          </blockquote>
        );
        i++;
        continue;
      }

      // 5. Markdown Table
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        const tableLines: string[] = [];
        const startIdx = i;
        while (i < n && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }
        if (tableLines.length >= 2) {
          const headerLine = tableLines[0];
          const headers = headerLine
            .split("|")
            .map((h) => h.trim())
            .filter(Boolean);
          const rowLines = tableLines.slice(2);

          elements.push(
            <div
              key={`table-${startIdx}`}
              className="my-4 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950/60 shadow-inner"
            >
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    {headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-3.5 py-2 font-bold text-gray-200">
                        {renderInlineMarkdown(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {rowLines.map((row, rIdx) => {
                    const cells = row
                      .split("|")
                      .map((c) => c.trim())
                      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                    return (
                      <tr key={rIdx} className="hover:bg-gray-900/30">
                        {cells.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3.5 py-2 text-gray-300">
                            {renderInlineMarkdown(cell)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      }

      // 6. Ordered List
      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (olMatch) {
        const startNum = parseInt(olMatch[1], 10) || 1;
        const olItems: { text: string; subItems: string[] }[] = [];
        const startIdx = i;

        while (i < n) {
          const currTrimmed = lines[i].trim();
          const itemMatch = currTrimmed.match(/^\d+\.\s+(.*)/);
          if (itemMatch) {
            const mainText = itemMatch[1];
            const subItems: string[] = [];
            i++;
            // Check for indented sub-bullets
            while (i < n) {
              const subTrimmed = lines[i].trim();
              if (
                (lines[i].startsWith("   ") || lines[i].startsWith("\t") || lines[i].startsWith("  ")) &&
                /^[-*]\s+(.*)/.test(subTrimmed)
              ) {
                const subMatch = subTrimmed.match(/^[-*]\s+(.*)/);
                if (subMatch) subItems.push(subMatch[1]);
                i++;
              } else {
                break;
              }
            }
            olItems.push({ text: mainText, subItems });
          } else if (currTrimmed === "") {
            // Peek ahead: if next non-empty line is another numbered item, allow loose spacing
            let peek = i + 1;
            while (peek < n && lines[peek].trim() === "") {
              peek++;
            }
            if (peek < n && /^\d+\.\s+/.test(lines[peek].trim())) {
              i = peek;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        elements.push(
          <ol
            key={`ol-${startIdx}`}
            start={startNum}
            className="list-decimal pl-5 space-y-2 my-2.5"
          >
            {olItems.map((item, itemIdx) => (
              <li
                key={`oli-${itemIdx}`}
                className="text-xs sm:text-sm text-gray-300 leading-relaxed pl-1"
              >
                <div>{renderInlineMarkdown(item.text)}</div>
                {item.subItems.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1 mt-1 text-gray-400">
                    {item.subItems.map((sub, sIdx) => (
                      <li key={`sub-${sIdx}`} className="text-xs">
                        {renderInlineMarkdown(sub)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // 7. Unordered List
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const ulItems: string[] = [];
        const startIdx = i;

        while (i < n) {
          const currTrimmed = lines[i].trim();
          if (currTrimmed.startsWith("- ") || currTrimmed.startsWith("* ")) {
            ulItems.push(currTrimmed.substring(2));
            i++;
          } else {
            break;
          }
        }

        elements.push(
          <ul
            key={`ul-${startIdx}`}
            className="list-disc pl-5 space-y-1.5 my-2"
          >
            {ulItems.map((item, itemIdx) => (
              <li
                key={`uli-${itemIdx}`}
                className="text-xs sm:text-sm text-gray-300 leading-relaxed pl-1"
              >
                {renderInlineMarkdown(item)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // 8. Blank line
      if (trimmed === "") {
        elements.push(<div key={`blank-${i}`} className="h-2" />);
        i++;
        continue;
      }

      // 9. Regular paragraph
      elements.push(
        <p
          key={`p-${i}`}
          className="text-xs sm:text-sm text-gray-300 leading-relaxed my-1.5"
        >
          {renderInlineMarkdown(line)}
        </p>
      );
      i++;
    }

    return elements;
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
      ) : topic.id === "glossary-section" || topic.id === "soc-glossary" ? (
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
