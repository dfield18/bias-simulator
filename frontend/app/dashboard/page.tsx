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
  fetchMe,
  UserProfile,
  apiFetchDirect,
} from "@/lib/api";
import { cachedFetch } from "@/lib/cache";

export default function Home() {
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [myTopics, setMyTopics] = useState<Record<string, string>>({}); // slug → role
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then(setUser).catch(() => {});
    Promise.all([
      cachedFetch("topics", () => fetchTopics(), 2 * 60 * 1000),
      cachedFetch("myTopics", () => fetchMyTopics(), 2 * 60 * 1000),
    ])
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
    setMyTopics((prev) => ({ ...prev, [slug]: "subscriber" }));
    try {
      await subscribeTopic(slug);
    } catch {
      setMyTopics((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
    }
  };

  const handleUnsubscribe = async (slug: string) => {
    const prev = myTopics[slug];
    setMyTopics((p) => {
      const next = { ...p };
      delete next[slug];
      return next;
    });
    try {
      await unsubscribeTopic(slug);
    } catch {
      if (prev) setMyTopics((p) => ({ ...p, [slug]: prev }));
    }
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
              Settings
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
    <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-4xl font-bold">Echo</h1>
        <UserButton />
      </div>
      {user && user.tier !== "free" ? (
        <>
          <p className="text-gray-400 text-sm sm:text-base mb-4 max-w-xl">
            Explore preloaded topics below, or create a new one — it takes about two minutes to gather tweets and build your dashboard.
          </p>
          <div className="flex items-center gap-3 mb-10 sm:mb-12">
            <Link
              href="/topics/new"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              + New Topic
            </Link>
            {user.tier === "pro" && (
              <button
                onClick={async () => {
                  try {
                    const data = await apiFetchDirect("/api/billing/portal", { method: "POST" });
                    if (data.url) window.location.href = data.url;
                  } catch {
                    alert("Could not open billing portal.");
                  }
                }}
                className="px-4 py-2.5 text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                Manage Billing
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-gray-400 text-sm sm:text-base mb-4 max-w-xl">
            Explore preloaded topics below. Upgrade to Pro to create your own topics and refresh data.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-sm font-medium transition-colors mb-10 sm:mb-12"
          >
            + New Topic
          </Link>
        </>
      )}

      {/* Upgrade banner for free users */}
      {user && user.tier === "free" && (
        <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">You&apos;re on the <span className="font-semibold">Free plan</span></p>
            <p className="text-xs text-gray-500 mt-0.5">Upgrade to create your own topics, refresh data, and get 50 refreshes per month.</p>
          </div>
          <Link
            href="/pricing"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shrink-0 ml-4"
          >
            Upgrade
          </Link>
        </div>
      )}

      {loading && <p className="text-gray-500">Loading topics...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {/* My Topics / Featured Topics */}
      {!loading && (
        <>
          {user && user.tier !== "free" && myTopicsList.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-300 mb-4">My Topics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <Link
                  href="/topics/new"
                  className="block bg-gray-900 border border-dashed border-gray-700 rounded-xl p-4 sm:p-6 hover:border-gray-500 transition-colors flex items-center justify-center"
                >
                  <div className="text-center">
                    <div className="text-2xl text-gray-600 mb-1">+</div>
                    <h2 className="text-base font-semibold text-gray-400">Add New Topic</h2>
                    <p className="text-gray-600 text-xs mt-1">Create a custom topic</p>
                  </div>
                </Link>
                {myTopicsList.map((topic) => (
                  <TopicCard key={topic.slug} topic={topic} />
                ))}
              </div>
            </>
          )}

          {/* Featured topics for free users (or all users as explore section) */}
          {(() => {
            const featured = topics.filter((t) => t.featured);
            const isFree = user && user.tier === "free";
            if (isFree && featured.length > 0) {
              return (
                <>
                  <h2 className="text-lg font-semibold text-gray-300 mb-4">Free Topics</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <Link
                      href="/pricing"
                      className="block bg-gray-900 border border-dashed border-gray-700 rounded-xl p-4 sm:p-6 hover:border-gray-500 transition-colors flex items-center justify-center"
                    >
                      <div className="text-center">
                        <div className="text-2xl text-gray-600 mb-1">+</div>
                        <h2 className="text-base font-semibold text-gray-400">Add New Topic</h2>
                        <p className="text-gray-600 text-xs mt-1">Upgrade to Pro</p>
                      </div>
                    </Link>
                    {featured.map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                </>
              );
            }
            return null;
          })()}
        </>
      )}

      {/* Public Topics (not yet subscribed) — hidden for free users */}
      {publicTopics.length > 0 && user && user.tier !== "free" && (
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

    </main>
  );
}
