"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { TopicData, fetchTopics } from "@/lib/api";

export default function Home() {
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTopics()
      .then(setTopics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl sm:text-4xl font-bold">Political Feed Simulator</h1>
        <UserButton />
      </div>
      <p className="text-gray-400 mb-6 sm:mb-8 text-sm sm:text-base">
        See how political bias shapes what appears in your Twitter feed.
        Select a topic to explore.
      </p>

      {loading && <p className="text-gray-500">Loading topics...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topics.map((topic) => (
          <div
            key={topic.slug}
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-600 transition-colors"
          >
            <Link href={`/analytics/${topic.slug}`}>
              <h2 className="text-xl font-semibold mb-2">{topic.name}</h2>
              {topic.description && (
                <p className="text-gray-400 text-sm mb-3">{topic.description}</p>
              )}
              <div className="flex gap-2 text-xs">
                <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                  {topic.anti_label}
                </span>
                <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded">
                  {topic.pro_label}
                </span>
              </div>
            </Link>
            <div className="mt-3 pt-3 border-t border-gray-800 flex gap-3">
              <Link
                href={`/analytics/${topic.slug}`}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                View Dashboard
              </Link>
              <Link
                href={`/topics/${topic.slug}`}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Manage
              </Link>
            </div>
          </div>
        ))}

        {/* Add new topic card */}
        <Link
          href="/topics/new"
          className="block bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 hover:border-gray-500 transition-colors flex items-center justify-center"
        >
          <div className="text-center">
            <div className="text-3xl text-gray-600 mb-2">+</div>
            <h2 className="text-lg font-semibold text-gray-400">
              Add New Topic
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              Create a custom topic with your own definitions
            </p>
          </div>
        </Link>
      </div>
    </main>
  );
}
