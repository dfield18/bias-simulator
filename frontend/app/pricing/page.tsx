"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { apiFetchDirect } from "@/lib/api";

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!isSignedIn) {
      window.location.href = "/sign-up";
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetchDirect("/api/billing/checkout", { method: "POST" });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Simple pricing</h1>
        <p className="text-gray-400">Start free, upgrade when you need more.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Free */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1">Free</h2>
          <div className="text-3xl font-bold mb-1">$0</div>
          <p className="text-sm text-gray-500 mb-6">Forever free</p>
          <ul className="space-y-2 text-sm text-gray-400 mb-8">
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> 2 topics
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> 3 refreshes per day
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> All analytics tabs
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> AI classification
            </li>
          </ul>
          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="block text-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Current plan
            </Link>
          ) : (
            <Link
              href="/sign-up"
              className="block text-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Get started
            </Link>
          )}
        </div>

        {/* Pro */}
        <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-6 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-3 py-0.5 rounded-full">
            Popular
          </div>
          <h2 className="text-lg font-semibold mb-1">Pro</h2>
          <div className="text-3xl font-bold mb-1">$29<span className="text-base font-normal text-gray-500">/mo</span></div>
          <p className="text-sm text-gray-500 mb-6">For serious analysis</p>
          <ul className="space-y-2 text-sm text-gray-400 mb-8">
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> Unlimited topics
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> Unlimited refreshes
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> All analytics tabs
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> AI classification
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">&#10003;</span> Priority support
            </li>
          </ul>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Redirecting..." : "Upgrade to Pro"}
          </button>
        </div>
      </div>

      <div className="text-center mt-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">&larr; Back to home</Link>
      </div>
    </main>
  );
}
