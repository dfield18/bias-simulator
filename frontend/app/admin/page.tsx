"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TopicData,
  TweetData,
  ClassificationData,
  AdminStats,
  fetchTopics,
  fetchAdminTweets,
  fetchAdminStats,
  submitOverride,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csv";

interface AdminRow {
  tweet: TweetData;
  classification: ClassificationData;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function confidenceColor(c: number | null): string {
  if (c == null) return "text-gray-600";
  if (c >= 0.85) return "text-green-400";
  if (c >= 0.7) return "text-yellow-400";
  return "text-red-400";
}

function bentBadge(bent: string | null, antiBent?: string, proBent?: string): string {
  const b = (bent || "").toLowerCase();
  if (antiBent && b === antiBent) return "bg-blue-500/20 text-blue-400";
  if (proBent && b === proBent) return "bg-red-500/20 text-red-400";
  if (b === "neutral") return "bg-gray-500/20 text-gray-400";
  return "bg-yellow-500/20 text-yellow-400";
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterBent, setFilterBent] = useState("");
  const [filterOverride, setFilterOverride] = useState(false);
  const [filterLowConf, setFilterLowConf] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("views");

  // Column sorting (client-side, on top of server sort)
  const [colSort, setColSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "",
    dir: "desc",
  });

  const toggleColSort = (key: string) => {
    setColSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  const sortedRows = (() => {
    if (!colSort.key) return rows;
    const sorted = [...rows].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (colSort.key) {
        case "author":
          aVal = a.tweet.screen_name || "";
          bVal = b.tweet.screen_name || "";
          return aVal.localeCompare(bVal);
        case "classification":
          aVal = a.classification.effective_political_bent || "";
          bVal = b.classification.effective_political_bent || "";
          return aVal.localeCompare(bVal);
        case "confidence":
          aVal = a.classification.confidence ?? 0;
          bVal = b.classification.confidence ?? 0;
          return aVal - bVal;
        case "intensity":
          aVal = a.classification.effective_intensity_score ?? 0;
          bVal = b.classification.effective_intensity_score ?? 0;
          return aVal - bVal;
        case "views":
          aVal = a.tweet.views ?? 0;
          bVal = b.tweet.views ?? 0;
          return aVal - bVal;
        default:
          return 0;
      }
    });
    return colSort.dir === "desc" ? sorted.reverse() : sorted;
  })();

  // Modal
  const [modalRow, setModalRow] = useState<AdminRow | null>(null);
  const [overrideBent, setOverrideBent] = useState("");
  const [overrideIntensity, setOverrideIntensity] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Navigation between tweets in modal
  const [modalIndex, setModalIndex] = useState(-1);

  // Get bent slugs for color coding
  const currentTopic = topics.find((t) => t.slug === selectedTopic);
  const antiBent = currentTopic?.anti_label?.toLowerCase().replace(/\s+/g, "-") || "";
  const proBent = currentTopic?.pro_label?.toLowerCase().replace(/\s+/g, "-") || "";

  const handleAuth = () => {
    const expected = process.env.NEXT_PUBLIC_ADMIN_SECRET;
    if (secret === expected) {
      setAuthenticated(true);
    } else {
      setError("Invalid secret");
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchTopics().then((t) => {
        setTopics(t);
        if (t.length > 0) setSelectedTopic(t[0].slug);
      });
    }
  }, [authenticated]);

  const loadData = useCallback(() => {
    if (!authenticated || !selectedTopic) return;
    setLoading(true);

    const filters = {
      political_bent: filterBent || undefined,
      override_only: filterOverride || undefined,
      low_confidence: filterLowConf || undefined,
      search: search || undefined,
      sort_by: sortBy,
      limit: 5000,
    };

    Promise.all([
      fetchAdminTweets(selectedTopic, secret, filters),
      fetchAdminStats(selectedTopic, secret),
    ])
      .then(([tweets, s]) => {
        setRows(tweets);
        setStats(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [authenticated, selectedTopic, filterBent, filterOverride, filterLowConf, search, sortBy, secret]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openModal = (row: AdminRow, index: number) => {
    setModalRow(row);
    setModalIndex(index);
    setOverrideBent(
      row.classification.override_political_bent ||
        row.classification.political_bent ||
        ""
    );
    setOverrideIntensity(
      row.classification.override_intensity_score?.toString() ||
        row.classification.intensity_score?.toString() ||
        ""
    );
    setOverrideNotes(row.classification.override_notes || "");
  };

  const navigateModal = (direction: number) => {
    const newIndex = modalIndex + direction;
    if (newIndex >= 0 && newIndex < sortedRows.length) {
      openModal(sortedRows[newIndex], newIndex);
    }
  };

  const handleSave = async () => {
    if (!modalRow) return;
    setSaving(true);
    try {
      await submitOverride(secret, {
        id_str: modalRow.tweet.id_str,
        override_political_bent: overrideBent || null,
        override_intensity_score: overrideIntensity
          ? parseInt(overrideIntensity)
          : null,
        override_notes: overrideNotes,
      });
      // Move to next tweet automatically
      if (modalIndex < sortedRows.length - 1) {
        navigateModal(1);
      } else {
        setModalRow(null);
      }
      loadData();
    } catch (e) {
      setError("Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcuts in modal
  useEffect(() => {
    if (!modalRow) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalRow(null);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateModal(-1);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateModal(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalRow, modalIndex, sortedRows]);

  if (!authenticated) {
    return (
      <main className="max-w-md mx-auto px-4 py-20">
        <h1 className="text-2xl font-bold mb-6">Admin Access</h1>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAuth()}
          placeholder="Enter admin secret"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}
        <button
          onClick={handleAuth}
          className="mt-4 w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
        >
          Authenticate
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-4">
          <a href="/" className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors text-gray-300">
            &larr; Back to Dashboard
          </a>
          <h1 className="text-xl sm:text-2xl font-bold">Classification Review</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const headers = [
                "id", "screen_name", "author_name", "followers", "tweet_text",
                "likes", "retweets", "replies", "views",
                "llm_classification", "effective_classification",
                "intensity_score", "effective_intensity", "confidence",
                "classification_method", "classification_basis",
                "override_flag", "override_notes", "created_at", "url",
              ];
              const csvRows = sortedRows.map((row) => [
                row.tweet.id_str,
                row.tweet.screen_name || "",
                row.tweet.author_name || "",
                String(row.tweet.author_followers || 0),
                row.tweet.full_text || "",
                String(row.tweet.likes),
                String(row.tweet.retweets),
                String(row.tweet.replies),
                String(row.tweet.views),
                row.classification.political_bent || "",
                row.classification.effective_political_bent || "",
                String(row.classification.intensity_score ?? ""),
                String(row.classification.effective_intensity_score ?? ""),
                String(row.classification.confidence ?? ""),
                row.classification.classification_method || "",
                row.classification.classification_basis || "",
                String(row.classification.override_flag ?? false),
                row.classification.override_notes || "",
                row.tweet.created_at || "",
                row.tweet.url || "",
              ]);
              downloadCsv(`admin-${selectedTopic}.csv`, headers, csvRows);
            }}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-gray-500">Total classified</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-yellow-400">
              {stats.overrides}
            </div>
            <div className="text-xs text-gray-500">Overridden</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-red-400">
              {stats.low_confidence}
            </div>
            <div className="text-xs text-gray-500">Low confidence (&lt;0.7)</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">By classification</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats.by_bent).map(([bent, data]) => (
                <span
                  key={bent}
                  className={`text-xs px-1.5 py-0.5 rounded ${bentBadge(bent, antiBent, proBent)}`}
                >
                  {bent}: {data.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedTopic}
            onChange={(e) => { setSelectedTopic(e.target.value); setFilterBent(""); }}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          >
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={filterBent}
            onChange={(e) => setFilterBent(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          >
            <option value="">All classifications</option>
            {currentTopic && (
              <>
                <option value={antiBent}>{currentTopic.anti_label}</option>
                <option value={proBent}>{currentTopic.pro_label}</option>
              </>
            )}
            <option value="neutral">Neutral</option>
            <option value="unclear">Unclear</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
          >
            <option value="views">Sort: Most viewed</option>
            <option value="engagement">Sort: Most engaged</option>
            <option value="confidence">Sort: Lowest confidence</option>
            <option value="recent">Sort: Most recent</option>
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tweets or authors..."
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm flex-1 min-w-[200px]"
          />

          <label className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
            <input
              type="checkbox"
              checked={filterLowConf}
              onChange={(e) => setFilterLowConf(e.target.checked)}
              className="rounded"
            />
            Low confidence
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
            <input
              type="checkbox"
              checked={filterOverride}
              onChange={(e) => setFilterOverride(e.target.checked)}
              className="rounded"
            />
            Overrides only
          </label>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">Dismiss</button>
        </div>
      )}

      {/* Results count */}
      <div className="text-xs text-gray-500 mb-2">
        {rows.length} tweets &middot; Click a row to review &middot; Use arrow
        keys to navigate in modal
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-lg h-12 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left text-xs">
                <th className="px-3 py-2 w-8">#</th>
                {[
                  { key: "author", label: "Author", align: "" },
                  { key: "", label: "Tweet", align: "" },
                  { key: "classification", label: "Classification", align: "" },
                  { key: "confidence", label: "Confidence", align: "text-right" },
                  { key: "intensity", label: "Intensity", align: "text-right" },
                  { key: "views", label: "Views", align: "text-right" },
                ].map((col) => (
                  <th
                    key={col.label}
                    className={`px-3 py-2 ${col.align} ${
                      col.key ? "cursor-pointer hover:text-gray-200 select-none" : ""
                    }`}
                    onClick={() => col.key && toggleColSort(col.key)}
                  >
                    {col.label}
                    {col.key && colSort.key === col.key && (
                      <span className="ml-1">{colSort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr
                  key={row.tweet.id_str}
                  onClick={() => openModal(row, i)}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    row.classification.override_flag
                      ? "bg-yellow-500/5"
                      : ""
                  }`}
                >
                  <td className="px-3 py-2 text-gray-600 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-300 whitespace-nowrap">
                    <div className="font-medium">@{row.tweet.screen_name}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-400">
                    <div className="whitespace-pre-wrap line-clamp-4 text-sm leading-relaxed max-w-2xl">
                      {row.tweet.full_text}
                    </div>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { value: antiBent, label: currentTopic?.anti_label || antiBent },
                        { value: proBent, label: currentTopic?.pro_label || proBent },
                        { value: "neutral", label: "Neutral" },
                      ].map((opt) => {
                        const isActive = row.classification.effective_political_bent === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={async () => {
                              if (isActive) return;
                              // Optimistic update — change local state immediately
                              setRows((prev) => prev.map((r) =>
                                r.tweet.id_str === row.tweet.id_str
                                  ? {
                                      ...r,
                                      classification: {
                                        ...r.classification,
                                        effective_political_bent: opt.value,
                                        override_political_bent: opt.value,
                                        override_flag: true,
                                      },
                                    }
                                  : r
                              ));
                              // Save to backend in background
                              try {
                                await submitOverride(secret, {
                                  id_str: row.tweet.id_str,
                                  override_political_bent: opt.value,
                                  override_intensity_score: null,
                                  override_notes: "Reclassified via inline toggle",
                                });
                              } catch { /* ignore */ }
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                              isActive
                                ? bentBadge(opt.value, antiBent, proBent) + " font-semibold"
                                : "bg-gray-800 text-gray-600 hover:text-gray-400"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {row.classification.override_flag && (
                      <span className="text-yellow-500 ml-1 text-xs" title="Overridden">
                        *
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-xs ${confidenceColor(
                      row.classification.confidence
                    )}`}
                  >
                    {row.classification.confidence != null
                      ? (row.classification.confidence * 100).toFixed(0) + "%"
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={async () => {
                          const current = row.classification.effective_intensity_score ?? 0;
                          const newVal = Math.max(current - 1, -10);
                          setRows((prev) => prev.map((r) =>
                            r.tweet.id_str === row.tweet.id_str
                              ? { ...r, classification: { ...r.classification, effective_intensity_score: newVal, override_intensity_score: newVal, override_flag: true } }
                              : r
                          ));
                          try { await submitOverride(secret, { id_str: row.tweet.id_str, override_political_bent: null, override_intensity_score: newVal, override_notes: "Intensity adjusted inline" }); } catch {}
                        }}
                        className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs flex items-center justify-center"
                      >-</button>
                      <span className={`font-mono text-xs w-7 text-center ${
                        (row.classification.effective_intensity_score ?? 0) > 0 ? "text-red-400" :
                        (row.classification.effective_intensity_score ?? 0) < 0 ? "text-blue-400" :
                        "text-gray-500"
                      }`}>
                        {row.classification.effective_intensity_score ?? 0}
                      </span>
                      <button
                        onClick={async () => {
                          const current = row.classification.effective_intensity_score ?? 0;
                          const newVal = Math.min(current + 1, 10);
                          setRows((prev) => prev.map((r) =>
                            r.tweet.id_str === row.tweet.id_str
                              ? { ...r, classification: { ...r.classification, effective_intensity_score: newVal, override_intensity_score: newVal, override_flag: true } }
                              : r
                          ));
                          try { await submitOverride(secret, { id_str: row.tweet.id_str, override_political_bent: null, override_intensity_score: newVal, override_notes: "Intensity adjusted inline" }); } catch {}
                        }}
                        className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs flex items-center justify-center"
                      >+</button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">
                    {formatNumber(row.tweet.views)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">&rsaquo;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalRow && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalRow(null);
          }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            {/* Modal header */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">Review Classification</h2>
                <span className="text-xs text-gray-500">
                  {modalIndex + 1} of {sortedRows.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateModal(-1)}
                  disabled={modalIndex === 0}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-30"
                >
                  &larr; Prev
                </button>
                <button
                  onClick={() => navigateModal(1)}
                  disabled={modalIndex === sortedRows.length - 1}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-30"
                >
                  Next &rarr;
                </button>
                <button
                  onClick={() => setModalRow(null)}
                  className="text-gray-500 hover:text-gray-300 text-xl ml-2"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Tweet content */}
            <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-gray-100">
                  {modalRow.tweet.author_name}
                </span>
                <span className="text-gray-500">
                  @{modalRow.tweet.screen_name}
                </span>
                <span className="text-gray-600 text-xs">
                  {formatNumber(modalRow.tweet.author_followers || 0)} followers
                </span>
              </div>
              {modalRow.tweet.author_bio && (
                <p className="text-xs text-gray-500 mb-2">
                  {modalRow.tweet.author_bio}
                </p>
              )}
              <p className="text-gray-200 whitespace-pre-wrap leading-relaxed mb-3">
                {modalRow.tweet.full_text}
              </p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>&#10084; {formatNumber(modalRow.tweet.likes)}</span>
                <span>&#128257; {formatNumber(modalRow.tweet.retweets)}</span>
                <span>&#128172; {formatNumber(modalRow.tweet.replies)}</span>
                <span>&#128065; {formatNumber(modalRow.tweet.views)}</span>
              </div>
              {modalRow.tweet.url && (
                <a
                  href={modalRow.tweet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block"
                >
                  View original
                </a>
              )}
            </div>

            {/* LLM classification details */}
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="text-xs font-semibold text-gray-400 mb-2">
                LLM Classification
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Political bent: </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${bentBadge(
                      modalRow.classification.political_bent, antiBent, proBent
                    )}`}
                  >
                    {modalRow.classification.political_bent}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Confidence: </span>
                  <span
                    className={`font-mono ${confidenceColor(
                      modalRow.classification.confidence
                    )}`}
                  >
                    {modalRow.classification.confidence != null
                      ? (modalRow.classification.confidence * 100).toFixed(1) +
                        "%"
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Method: </span>
                  <span className="text-gray-300">
                    {modalRow.classification.classification_method || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Intensity: </span>
                  <span className="text-gray-300 font-mono">
                    {modalRow.classification.intensity_score ?? "N/A"}
                  </span>
                </div>
                {modalRow.classification.author_lean && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Author lean: </span>
                    <span className="text-gray-300">
                      {modalRow.classification.author_lean}
                    </span>
                  </div>
                )}
                {modalRow.classification.agreement && (
                  <div>
                    <span className="text-gray-500">Agreement: </span>
                    <span className="text-gray-300">
                      {modalRow.classification.agreement}
                    </span>
                  </div>
                )}
                {modalRow.classification.votes && (
                  <div>
                    <span className="text-gray-500">Votes: </span>
                    <span className="text-gray-300 text-xs">
                      {modalRow.classification.votes}
                    </span>
                  </div>
                )}
              </div>
              {modalRow.classification.classification_basis && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Reasoning</div>
                  <p className="text-sm text-gray-300">
                    {modalRow.classification.classification_basis}
                  </p>
                </div>
              )}
              {modalRow.classification.intensity_reasoning && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">
                    Intensity reasoning
                  </div>
                  <p className="text-sm text-gray-300">
                    {modalRow.classification.intensity_reasoning}
                  </p>
                </div>
              )}
            </div>

            {/* Override form */}
            <div className="border border-gray-700 rounded-lg p-4">
              <div className="text-xs font-semibold text-gray-400 mb-3">
                Human Override
                {modalRow.classification.override_flag && (
                  <span className="text-yellow-400 ml-2">(currently overridden)</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Political Bent
                  </label>
                  <select
                    value={overrideBent}
                    onChange={(e) => setOverrideBent(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                  >
                    <option value="">-- No override --</option>
                    <option value="anti-war">Anti-War</option>
                    <option value="pro-war">Pro-War</option>
                    <option value="neutral">Neutral</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Intensity Score (-10 to 10)
                  </label>
                  <input
                    type="number"
                    min={-10}
                    max={10}
                    value={overrideIntensity}
                    onChange={(e) => setOverrideIntensity(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                    placeholder="Empty = no override"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Notes
                </label>
                <textarea
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-none"
                  placeholder="Reason for override..."
                />
              </div>

              <div className="flex gap-3 justify-between">
                <div className="text-xs text-gray-600">
                  Saves and advances to next tweet
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => navigateModal(1)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save & Next"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
