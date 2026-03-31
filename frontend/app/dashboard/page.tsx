"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  TopicData,
  fetchTopics,
  fetchMyTopics,
  subscribeTopic,
  unsubscribeTopic,
} from "@/lib/api";

export default function Home() {
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [myTopics, setMyTopics] = useState<Record<string, string>>({}); // slug → role
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchTopics(), fetchMyTopics()])
      .then(([t, my]) => {
        setTopics(t);
        setMyTopics(my);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const myTopicsList = topics.filter((t) => t.slug in myTopics);
  const publicTopics = topics.filter((t) => !(t.slug in myTopics));

  const handleSubscribe = async (slug: string) => {
    await subscribeTopic(slug);
    setMyTopics((prev) => ({ ...prev, [slug]: "subscriber" }));
  };

  const handleUnsubscribe = async (slug: string) => {
    await unsubscribeTopic(slug);
    setMyTopics((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
  };

  function TopicCard({ topic }: { topic: TopicData }) {
    const role = myTopics[topic.slug]; // "creator", "subscriber", or undefined
    const isSubscribed = !!role;

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 hover:border-gray-600 transition-colors">
        <Link href={`/analytics/${topic.slug}`}>
          <h2 className="text-lg sm:text-xl font-semibold mb-2">
            {topic.name}
            {topic.visibility === "private" && (
              <span className="ml-2 text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded align-middle">
                Private
              </span>
            )}
          </h2>
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
        <div className="mt-3 pt-3 border-t border-gray-800 flex gap-3 items-center">
          <Link
            href={`/analytics/${topic.slug}`}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            View Dashboard
          </Link>
          {role === "creator" && (
            <Link
              href={`/topics/${topic.slug}`}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Manage
            </Link>
          )}
          {isSubscribed && role !== "creator" && (
            <button
              onClick={() => handleUnsubscribe(topic.slug)}
              className="text-xs text-gray-600 hover:text-red-400 ml-auto"
            >
              Unsubscribe
            </button>
          )}
          {!isSubscribed && (
            <button
              onClick={() => handleSubscribe(topic.slug)}
              className="text-xs text-blue-500 hover:text-blue-400 ml-auto"
            >
              + Subscribe
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl sm:text-4xl font-bold">Echo</h1>
        <UserButton />
      </div>
      <p className="text-gray-400 mb-6 sm:mb-8 text-sm sm:text-base">
        Analyze any political topic from both sides.
      </p>

      {loading && <p className="text-gray-500">Loading topics...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {/* My Topics */}
      {myTopicsList.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-300 mb-3">My Topics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {myTopicsList.map((topic) => (
              <TopicCard key={topic.slug} topic={topic} />
            ))}
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
        </>
      )}

      {/* Public Topics (not yet subscribed) */}
      {publicTopics.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-gray-300 mb-3">
            {myTopicsList.length > 0 ? "Explore Topics" : "Topics"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {publicTopics.map((topic) => (
              <TopicCard key={topic.slug} topic={topic} />
            ))}
          </div>
        </>
      )}

      {/* Show Add New Topic if no My Topics section */}
      {myTopicsList.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      )}
    </main>
  );
}
