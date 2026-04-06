"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { fetchMe, UserProfile, apiFetchDirect } from "@/lib/api";

interface UsageStats {
  topics_created: number;
  max_topics: number | null;
  runs_this_month: number;
  max_runs: number | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchMe().then(setUser).catch(() => {});
    apiFetchDirect("/api/account/usage").then(setUsage).catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await apiFetchDirect("/api/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dividedview-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetchDirect("/api/account", { method: "DELETE" });
      await signOut();
      router.replace("/");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-12 sm:py-16">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300 mb-8 inline-block">&larr; Back to Dashboard</Link>
      <h1 className="text-2xl font-bold mb-6">Account Settings</h1>

      {/* Profile */}
      {user && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Profile</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="text-gray-300">{user.email || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <span className="text-gray-300 capitalize">{user.tier}</span>
            </div>
          </div>
        </div>
      )}

      {/* Usage */}
      {user && usage && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Usage</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Custom Topics</span>
              <span className="text-gray-300">
                {usage.topics_created}{usage.max_topics !== null ? ` / ${usage.max_topics}` : ""}
                {usage.max_topics === null && <span className="text-gray-600 ml-1">(unlimited)</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Refreshes This Month</span>
              <span className="text-gray-300">
                {usage.runs_this_month}{usage.max_runs !== null ? ` / ${usage.max_runs}` : ""}
                {usage.max_runs === null && <span className="text-gray-600 ml-1">(unlimited)</span>}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Billing */}
      {user && user.tier === "pro" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Billing</h2>
          <p className="text-xs text-gray-500 mb-3">Manage your subscription, update payment method, or cancel.</p>
          <button
            onClick={async () => {
              try {
                const data = await apiFetchDirect("/api/billing/portal", { method: "POST" });
                if (data.url) window.location.href = data.url;
              } catch {
                alert("Could not open billing portal.");
              }
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Manage Billing
          </button>
        </div>
      )}

      {/* Data Export */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Export Your Data</h2>
        <p className="text-xs text-gray-500 mb-3">Download all your account data including profile, topics, and pipeline history.</p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Download Data"}
        </button>
      </div>

      {/* Delete Account */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">Delete Account</h2>
        <p className="text-xs text-gray-500 mb-4">
          Permanently removes your account, custom topics, and all associated data. This cannot be undone.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-medium"
          >
            Delete Account
          </button>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-300 mb-3">
              Are you sure? This will permanently delete your account and all your data.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete my account"}
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

      <p className="text-[10px] text-gray-600 mt-6 text-center">
        Need help? Contact <a href="mailto:support@dividedview.com" className="text-blue-400 hover:text-blue-300">support@dividedview.com</a>
      </p>
    </main>
  );
}
