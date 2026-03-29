"use client";

import { useState } from "react";
import { SummaryData } from "@/lib/api";

interface SummaryTabsProps {
  summaries: Record<string, SummaryData>;
  antiLabel: string;
  proLabel: string;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SummaryTabs({
  summaries,
  antiLabel,
  proLabel,
}: SummaryTabsProps) {
  const [activeTab, setActiveTab] = useState<"overall" | "anti" | "pro">("overall");

  const tabs = [
    { key: "overall" as const, label: "Overall", color: "text-gray-300", borderColor: "border-gray-400", bgColor: "bg-gray-500/10" },
    { key: "anti" as const, label: antiLabel, color: "text-blue-400", borderColor: "border-blue-400", bgColor: "bg-blue-500/10" },
    { key: "pro" as const, label: proLabel, color: "text-red-400", borderColor: "border-red-400", bgColor: "bg-red-500/10" },
  ];

  const activeSummary = summaries[activeTab];
  const activeTabConfig = tabs.find((t) => t.key === activeTab)!;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Topic Overview</div>
        <h3 className="text-sm font-semibold text-gray-300 mb-0.5">
          What's Being Said
        </h3>
        <p className="text-[10px] sm:text-xs text-gray-600">
          A summary of the conversation — themes, events, and tone
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? `${tab.color} border-b-2 ${tab.borderColor}`
                : "text-gray-500 hover:text-gray-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary content */}
      <div className={`p-4 sm:p-5 ${activeTabConfig.bgColor}`}>
        {activeSummary ? (
          <>
            <div className="text-xs sm:text-sm text-gray-300 leading-relaxed space-y-3">
              {activeSummary.summary.split("\n").filter(Boolean).map((para, i) => {
                // Render **bold** text within paragraphs
                const parts = para.split(/\*\*(.+?)\*\*/g);
                return (
                  <p key={i}>
                    {parts.map((part, j) =>
                      j % 2 === 1 ? (
                        <span key={j} className="font-semibold text-gray-200">
                          {part}
                        </span>
                      ) : (
                        <span key={j}>{part}</span>
                      )
                    )}
                  </p>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
              <span>Based on {activeSummary.tweet_count} tweets</span>
              {activeSummary.generated_at && (
                <span>Updated {timeAgo(activeSummary.generated_at)}</span>
              )}
              <span className="bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded text-[10px]">
                AI-generated
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            No summary available yet. Run the pipeline to generate one.
          </p>
        )}
      </div>
    </div>
  );
}
