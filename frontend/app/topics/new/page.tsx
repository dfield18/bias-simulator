"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SearchPills from "@/components/SearchPills";
import { invalidateCache } from "@/lib/cache";
import {
  TopicSuggestion,
  PipelineProgress,
  suggestTopic,
  createTopic,
  runTopicPipeline,
  fetchPipelineProgress,
} from "@/lib/api";

export default function NewTopicPage() {
  const router = useRouter();
  const [topicInput, setTopicInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<TopicSuggestion | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [targetCountry, setTargetCountry] = useState("United States");
  const [maxPages, setMaxPages] = useState(25);
  const [colorScheme, setColorScheme] = useState("political");
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  const handleSuggest = async () => {
    if (!topicInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await suggestTopic(topicInput.trim());
      setSuggestion(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof TopicSuggestion, value: string) => {
    if (!suggestion) return;
    setSuggestion({ ...suggestion, [field]: value });
  };

  const handleCreate = async () => {
    if (!suggestion) return;
    setCreating(true);
    setError(null);
    setPipelineProgress(null);
    try {
      await createTopic({
        ...suggestion,
        target_language: targetLanguage,
        target_country: targetCountry || undefined,
        color_scheme: colorScheme,
      });
      invalidateCache("topics");
      await runTopicPipeline(suggestion.slug, { maxPages });
      // Poll for pipeline progress
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const prog = await fetchPipelineProgress(suggestion.slug);
          if (prog) {
            setPipelineProgress(prog);
            if (!prog.running) {
              // Pipeline finished — navigate to dashboard
              router.push(`/analytics/${suggestion.slug}`);
              return;
            }
          }
        } catch { /* keep polling */ }
      }
      // Timeout — navigate anyway
      router.push(`/analytics/${suggestion.slug}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred");
      setCreating(false);
    }
  };

  // Show pipeline progress screen while creating
  if (creating) {
    return (
      <main className="max-w-lg mx-auto px-4 py-20">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="animate-spin h-10 w-10 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-6" />
          <h2 className="text-lg font-bold text-gray-200 mb-2">
            Setting up {suggestion?.topic_name || "your topic"}
          </h2>
          {pipelineProgress ? (
            <>
              <p className="text-sm font-medium text-gray-300 mb-2">{pipelineProgress.label}</p>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${pipelineProgress.pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                <span>Step {pipelineProgress.step} of {pipelineProgress.total_steps}</span>
                <span>{pipelineProgress.pct}%</span>
              </div>
              {pipelineProgress.detail && (
                <p className="text-xs text-gray-500 leading-relaxed bg-gray-800/50 rounded-lg p-3 text-left">
                  {pipelineProgress.detail}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">
              Creating topic and starting tweet collection...
            </p>
          )}
          <p className="text-[10px] text-gray-600 mt-6">
            This usually takes 3-10 minutes. You&apos;ll be redirected to the dashboard when it&apos;s ready.
          </p>
          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold">Create New Topic</h1>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          &larr; Back
        </Link>
      </div>

      {/* Step 1: Enter topic */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">
          What topic do you want to analyze?
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter a political topic and we&apos;ll suggest how to define the two sides.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSuggest()}
            placeholder='e.g. "US Immigration", "AI Regulation"'
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSuggest}
            disabled={loading || !topicInput.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>

        {/* Loading progress */}
        {loading && (
          <div className="mt-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-1.5 flex-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
            <p className="text-sm text-gray-300">
              Analyzing &quot;{topicInput}&quot; &mdash; defining the two sides, generating search queries, and building classification prompts. This usually takes 10-15 seconds.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Step 2: Review and adjust */}
      {suggestion && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-300">
            We&apos;ve generated a suggested definition based on your topic. All fields below are fully editable &mdash; adjust the side labels, definitions, search queries, and classification prompts to match your specific research needs.
          </p>
        </div>
      )}
      {suggestion && (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              Topic Definition
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Topic Name
                  </label>
                  <input
                    type="text"
                    value={suggestion.topic_name}
                    onChange={(e) => updateField("topic_name", e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    value={suggestion.slug}
                    onChange={(e) => updateField("slug", e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Description
                </label>
                <textarea
                  value={suggestion.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-y"
                />
              </div>

              <SearchPills
                value={suggestion.search_query}
                onChange={(val) => updateField("search_query", val)}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tweet Language</label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="pt">Portuguese</option>
                    <option value="ar">Arabic</option>
                    <option value="he">Hebrew</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="zh">Chinese</option>
                    <option value="hi">Hindi</option>
                    <option value="ru">Russian</option>
                    <option value="it">Italian</option>
                  </select>
                  <p className="text-[10px] text-gray-600 mt-1">Only fetch tweets in this language</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Target Audience Country</label>
                  <select
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                  >
                    <option value="">No filter (global)</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                    <option value="India">India</option>
                    <option value="Germany">Germany</option>
                    <option value="France">France</option>
                    <option value="Brazil">Brazil</option>
                    <option value="Japan">Japan</option>
                    <option value="Israel">Israel</option>
                    <option value="Mexico">Mexico</option>
                    <option value="Spain">Spain</option>
                  </select>
                  <p className="text-[10px] text-gray-600 mt-1">Filter tweets to what someone in this country would likely see</p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tweet Volume</label>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              >
                <option value={10}>Small (~200 tweets)</option>
                <option value={25}>Medium (~500 tweets)</option>
                <option value={50}>Large (~1,000 tweets)</option>
                <option value={100}>Extra Large (~2,000 tweets)</option>
              </select>
              <p className="text-[10px] text-gray-600 mt-1">More tweets = better analysis but slower pipeline</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Color Scheme</label>
              <select
                value={colorScheme}
                onChange={(e) => setColorScheme(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              >
                <option value="political">Political (Blue / Red)</option>
                <option value="neutral">Neutral (Purple / Green)</option>
              </select>
              <p className="text-[10px] text-gray-600 mt-1">Use neutral for topics that don&apos;t map to left/right politics</p>
            </div>
          </div>

          {/* Pro/Anti definitions — the key section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Anti side — Left */}
            <div className={`bg-gray-900 border rounded-xl p-5 ${
              colorScheme === "neutral" ? "border-purple-500/30" : "border-blue-500/30"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${colorScheme === "neutral" ? "bg-purple-500" : "bg-blue-500"}`} />
                <label className="text-xs text-gray-500">
                  Left Position
                </label>
              </div>
              <input
                type="text"
                value={suggestion.anti_label}
                onChange={(e) => updateField("anti_label", e.target.value)}
                className={`w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-semibold mb-3 ${
                  colorScheme === "neutral" ? "text-purple-400" : "text-blue-400"
                }`}
              />
              <label className="block text-xs text-gray-500 mb-1">
                Definition — what does this side believe?
              </label>
              <textarea
                value={suggestion.anti_definition}
                onChange={(e) => updateField("anti_definition", e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-y"
              />
            </div>

            {/* Pro side — Right */}
            <div className={`bg-gray-900 border rounded-xl p-5 ${
              colorScheme === "neutral" ? "border-green-500/30" : "border-red-500/30"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${colorScheme === "neutral" ? "bg-green-500" : "bg-red-500"}`} />
                <label className="text-xs text-gray-500">
                  Right Position
                </label>
              </div>
              <input
                type="text"
                value={suggestion.pro_label}
                onChange={(e) => updateField("pro_label", e.target.value)}
                className={`w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-semibold mb-3 ${
                  colorScheme === "neutral" ? "text-green-400" : "text-red-400"
                }`}
              />
              <label className="block text-xs text-gray-500 mb-1">
                Definition — what does this side believe?
              </label>
              <textarea
                value={suggestion.pro_definition}
                onChange={(e) => updateField("pro_definition", e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-y"
              />
            </div>
          </div>

          {/* Narrative Frames & Emotions */}
          {(suggestion.custom_frames?.length || suggestion.custom_emotions?.length) ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold mb-1">Narrative Analysis</h2>
              <p className="text-sm text-gray-500 mb-4">
                These frames and emotions will be used to classify how each side argues about this topic.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {suggestion.custom_frames && suggestion.custom_frames.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">
                      Narrative Frames ({suggestion.custom_frames.length})
                    </label>
                    <div className="space-y-1.5">
                      {suggestion.custom_frames.map((f, i) => (
                        <div key={f.key} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600 text-xs w-4">{i + 1}.</span>
                          <input
                            type="text"
                            value={f.label}
                            onChange={(e) => {
                              const updated = [...suggestion.custom_frames!];
                              updated[i] = { ...updated[i], label: e.target.value };
                              setSuggestion({ ...suggestion, custom_frames: updated });
                            }}
                            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {suggestion.custom_emotions && suggestion.custom_emotions.length > 0 && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">
                      Emotional Tones ({suggestion.custom_emotions.length})
                    </label>
                    <div className="space-y-1.5">
                      {suggestion.custom_emotions.map((e, i) => (
                        <div key={e.key} className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600 text-xs w-4">{i + 1}.</span>
                          <input
                            type="text"
                            value={e.label}
                            onChange={(ev) => {
                              const updated = [...suggestion.custom_emotions!];
                              updated[i] = { ...updated[i], label: ev.target.value };
                              setSuggestion({ ...suggestion, custom_emotions: updated });
                            }}
                            className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Advanced: view/edit prompts */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <button
              onClick={() => setShowPrompts(!showPrompts)}
              className="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-2"
            >
              <span>{showPrompts ? "\u25BC" : "\u25B6"}</span>
              Advanced: View & Edit LLM Prompts
            </button>

            {showPrompts && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Classification Prompt
                  </label>
                  <textarea
                    value={suggestion.classification_prompt}
                    onChange={(e) =>
                      updateField("classification_prompt", e.target.value)
                    }
                    rows={12}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs font-mono resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Intensity Scoring Prompt
                  </label>
                  <textarea
                    value={suggestion.intensity_prompt}
                    onChange={(e) =>
                      updateField("intensity_prompt", e.target.value)
                    }
                    rows={12}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs font-mono resize-y"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Create button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setSuggestion(null);
                setTopicInput("");
              }}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
            >
              Start Over
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {creating
                ? "Creating & fetching tweets..."
                : "Create Topic & Fetch Tweets"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
