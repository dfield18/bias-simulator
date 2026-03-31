"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SearchPills from "@/components/SearchPills";
import {
  TopicDetail,
  PipelineRun,
  fetchTopicDetail,
  updateTopic,
  deleteTopic,
  fetchTopicRuns,
  runTopicPipeline,
  fetchPipelineProgress,
} from "@/lib/api";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TopicManagePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState<{ label: string; pct: number; detail: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [proLabel, setProLabel] = useState("");
  const [antiLabel, setAntiLabel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationPrompt, setClassificationPrompt] = useState("");
  const [intensityPrompt, setIntensityPrompt] = useState("");
  const [maxPages, setMaxPages] = useState(25);
  const [pipelineHours, setPipelineHours] = useState(48);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [targetCountry, setTargetCountry] = useState("");
  const [colorScheme, setColorScheme] = useState("political");

  const loadData = () => {
    setLoading(true);
    Promise.all([fetchTopicDetail(slug), fetchTopicRuns(slug)])
      .then(([t, r]) => {
        setTopic(t);
        setRuns(r);
        setName(t.name);
        setDescription(t.description || "");
        setProLabel(t.pro_label);
        setAntiLabel(t.anti_label);
        setSearchQuery(t.search_query || "");
        setClassificationPrompt(t.classification_prompt || "");
        setIntensityPrompt(t.intensity_prompt || "");
        setTargetLanguage(t.target_language || "en");
        setTargetCountry(t.target_country || "");
        setColorScheme(t.color_scheme || "political");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateTopic(slug, {
        topic_name: name,
        description,
        pro_label: proLabel,
        anti_label: antiLabel,
        search_query: searchQuery,
        classification_prompt: classificationPrompt,
        intensity_prompt: intensityPrompt,
        target_language: targetLanguage,
        target_country: targetCountry || null,
        color_scheme: colorScheme,
      });
      setTopic(updated);
      setSuccess("Topic saved successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    setPipelineProgress(null);
    setError(null);
    try {
      await runTopicPipeline(slug, { hours: pipelineHours, maxPages });
      // Poll for progress
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const prog = await fetchPipelineProgress(slug);
          if (prog) {
            setPipelineProgress({ label: prog.label, pct: prog.pct, detail: prog.detail });
            if (!prog.running) {
              if (prog.label === "Error") {
                const detail = prog.detail || "Unknown error";
                let userMessage = `Pipeline failed: ${detail}`;
                if (detail.includes("API key not valid") || detail.includes("INVALID_ARGUMENT")) {
                  userMessage = "Pipeline failed: The Gemini API key is invalid or expired. Go to Railway → Variables and update GEMINI_API_KEY with a valid key from https://aistudio.google.com/apikey";
                } else if (detail.includes("401") || detail.includes("Unauthorized")) {
                  userMessage = "Pipeline failed: The SocialData API key is invalid. Go to Railway → Variables and update SOCIALDATA_API_KEY.";
                } else if (detail.includes("402") || detail.includes("Payment Required")) {
                  userMessage = "Pipeline failed: The SocialData API account has run out of credits. Top up at socialdata.tools.";
                }
                setError(userMessage);
              } else {
                setSuccess("Pipeline complete! View your updated dashboard.");
              }
              break;
            }
          }
        } catch { /* keep polling */ }
      }
      fetchTopicRuns(slug).then(setRuns);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start pipeline");
    } finally {
      setPipelineRunning(false);
      setPipelineProgress(null);
    }
  };

  const handleToggleActive = async () => {
    if (!topic) return;
    try {
      const updated = await updateTopic(slug, { is_active: !topic.is_active });
      setTopic(updated);
      setSuccess(updated.is_active ? "Topic activated." : "Topic deactivated.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTopic(slug);
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12 text-gray-500">
        Loading topic...
      </main>
    );
  }

  if (!topic) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-red-400">Topic not found.</p>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300 mt-4 inline-block">
          &larr; Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Manage: {topic.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            /{topic.slug} &middot; Created {timeAgo(topic.created_at)}
            {!topic.is_active && (
              <span className="text-yellow-400 ml-2">(Inactive)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/analytics/${slug}`}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
          >
            View Dashboard
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">
            &larr; Home
          </Link>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">
            Dismiss
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-sm text-green-400">
          {success}
        </div>
      )}

      {/* Pipeline section */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Pipeline</h2>
          <button
            onClick={handleRunPipeline}
            disabled={pipelineRunning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {pipelineRunning
              ? pipelineProgress
                ? `${pipelineProgress.label} (${pipelineProgress.pct}%)`
                : "Starting..."
              : "Run Pipeline Now"}
          </button>
        </div>

        {/* Pipeline progress bar */}
        {pipelineRunning && pipelineProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-300 font-medium">{pipelineProgress.label}</span>
              <span className="text-[10px] text-gray-500">{pipelineProgress.pct}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${pipelineProgress.pct}%` }}
              />
            </div>
            {pipelineProgress.detail && (
              <p className="text-[10px] text-gray-500 mt-1">{pipelineProgress.detail}</p>
            )}
          </div>
        )}
        {pipelineRunning && !pipelineProgress && (
          <div className="mb-4 flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-400 border-t-transparent rounded-full shrink-0" />
            <p className="text-xs text-gray-400">Initializing pipeline...</p>
          </div>
        )}

        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">No pipeline runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="px-2 py-1.5 text-left">When</th>
                  <th className="px-2 py-1.5 text-right">Fetched</th>
                  <th className="px-2 py-1.5 text-right">New</th>
                  <th className="px-2 py-1.5 text-right">Classified</th>
                  <th className="px-2 py-1.5 text-right">Cost</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-gray-800/50">
                    <td className="px-2 py-1.5 text-gray-400">
                      {timeAgo(run.ran_at)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-300">
                      {run.tweets_fetched ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-300">
                      {run.tweets_new ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-300">
                      {run.tweets_classified ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-400">
                      {run.total_cost_usd != null
                        ? `$${run.total_cost_usd.toFixed(4)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`${
                          run.status === "success"
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {run.status}
                      </span>
                      {run.error_message && (
                        <span
                          className="text-red-400/60 ml-1"
                          title={run.error_message}
                        >
                          (!)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="text-sm font-semibold text-blue-200 mb-2">These settings were auto-generated &mdash; customize them to improve results</div>
        <p className="text-xs text-blue-300/80 leading-relaxed mb-2">
          Edit any field below to control how the tool builds your simulated feed and classifies tweets.
        </p>
        <ul className="space-y-1.5 text-xs text-blue-300/80 leading-relaxed">
          <li><span className="text-blue-200 font-medium">Search query</span> &mdash; determines which tweets are pulled from Twitter. Broaden it to get more data or narrow it to focus on a specific angle.</li>
          <li><span className="text-blue-200 font-medium">Side labels &amp; definitions</span> &mdash; tell the classifier what the two sides believe. More specific definitions produce more accurate tweet classifications.</li>
          <li><span className="text-blue-200 font-medium">Classification prompts</span> (under Advanced) &mdash; the exact instructions sent to the AI to classify and score each tweet. Edit these for full control over how the tool interprets content.</li>
        </ul>
        <p className="text-[11px] text-blue-400/60 mt-2">Save Changes &rarr; Run Pipeline Now to apply</p>
      </div>

      {/* Topic settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Topic Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Slug (read-only)</label>
              <input
                type="text"
                value={topic.slug}
                disabled
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-500 cursor-default caret-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm resize-y"
            />
          </div>

          <SearchPills value={searchQuery} onChange={setSearchQuery} />

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
              <p className="text-[10px] text-gray-600 mt-1">Filter tweets to what someone in this country would likely see — excludes hyper-local foreign content</p>
            </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tweet Volume (pages per run)</label>
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
              <p className="text-[10px] text-gray-600 mt-1">
                More tweets = better analysis but slower pipeline and higher API costs
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time Window</label>
              <select
                value={pipelineHours}
                onChange={(e) => setPipelineHours(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              >
                <option value={24}>Last 24 hours</option>
                <option value={48}>Last 48 hours</option>
                <option value={168}>Last 7 days</option>
                <option value={720}>Last 30 days</option>
              </select>
              <p className="text-[10px] text-gray-600 mt-1">
                How far back to search for tweets
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Left Label</label>
              <input
                type="text"
                value={antiLabel}
                onChange={(e) => setAntiLabel(e.target.value)}
                className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-sm font-semibold ${
                  colorScheme === "neutral"
                    ? "border-purple-500/30 text-purple-400"
                    : "border-blue-500/30 text-blue-400"
                }`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Right Label</label>
              <input
                type="text"
                value={proLabel}
                onChange={(e) => setProLabel(e.target.value)}
                className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-sm font-semibold ${
                  colorScheme === "neutral"
                    ? "border-green-500/30 text-green-400"
                    : "border-red-500/30 text-red-400"
                }`}
              />
            </div>
          </div>

          {/* Prompts - collapsible */}
          <div>
            <button
              onClick={() => setShowPrompts(!showPrompts)}
              className="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-2"
            >
              <span>{showPrompts ? "\u25BC" : "\u25B6"}</span>
              LLM Prompts
            </button>

            {showPrompts && (
              <div className="mt-3 space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Classification Prompt
                  </label>
                  <textarea
                    value={classificationPrompt}
                    onChange={(e) => setClassificationPrompt(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs font-mono resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Intensity Prompt
                  </label>
                  <textarea
                    value={intensityPrompt}
                    onChange={(e) => setIntensityPrompt(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs font-mono resize-y"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-gray-900 border border-red-500/20 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-red-400 mb-3">Delete This Topic</h2>
        <p className="text-xs text-gray-500 mb-4">
          This will permanently remove the topic and all its tweets, classifications, and analytics data. This action cannot be undone.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={confirmDelete}
            className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Delete Topic
          </button>
          {confirmDelete && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-300 mb-3">
                Are you sure you want to permanently delete <span className="font-semibold">{topic.name}</span> and all its data?
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium text-white"
                >
                  Yes, permanently delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
