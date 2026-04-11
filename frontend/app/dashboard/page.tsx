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
  const [userLoading, setUserLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState(false);

  useEffect(() => {
    // Check for ?upgraded=true from Stripe checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      setUpgraded(true);
      window.history.replaceState({}, "", "/dashboard");
    }
    fetchMe().then(setUser).catch((e) => setError("Could not connect to backend. Please try again.")).finally(() => setUserLoading(false));
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

  const myPolitical = myTopicsList.filter((t) => t.topic_type !== "company");
  const myCompany = myTopicsList.filter((t) => t.topic_type === "company");
  const publicPolitical = publicTopics.filter((t) => t.topic_type !== "company");
  const publicCompany = publicTopics.filter((t) => t.topic_type === "company");

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
    const role = myTopics[topic.slug];
    const isCompany = topic.topic_type === "company";

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
            <span className={`px-2 py-1 rounded ${isCompany ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>
              {topic.anti_label}
            </span>
            <span className={`px-2 py-1 rounded ${isCompany ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
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
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl sm:text-4xl font-bold">DividedView</h1>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Settings</Link>
          <UserButton />
        </div>
      </div>

      {/* Upgrade success banner */}
      {upgraded && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-green-300 font-medium">Welcome to Pro!</p>
            <p className="text-xs text-green-400/70 mt-0.5">Your account has been upgraded. You now have unlimited topics and 100 refreshes per month.</p>
          </div>
          <button onClick={() => setUpgraded(false)} className="text-green-400/50 hover:text-green-300 text-lg shrink-0 ml-4">&times;</button>
        </div>
      )}

      {userLoading ? (
        <p className="text-gray-500 text-sm mb-10">Loading your account...</p>
      ) : error && !user ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">{error}</div>
      ) : user && user.tier !== "free" ? (
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
            Explore preloaded topics below, or create your own — free plan includes 1 custom topic and 3 refreshes per month.
          </p>
          <Link
            href="/topics/new"
            className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors mb-10 sm:mb-12"
          >
            + New Topic
          </Link>
        </>
      )}

      {/* Upgrade banner for free users */}
      {user && user.tier === "free" && (
        <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300">You&apos;re on the <span className="font-semibold">Free plan</span> — 1 custom topic, 3 refreshes/month</p>
            <p className="text-xs text-gray-500 mt-0.5">Upgrade to Pro for unlimited topics and 100 refreshes per month. Questions? <a href="mailto:support@dividedview.com" className="text-blue-400 hover:text-blue-300">support@dividedview.com</a></p>
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
          {/* Public Policy / Political section */}
          {(() => {
            const featured = topics.filter((t) => t.featured && t.topic_type !== "company");
            const isFree = user && user.tier === "free";
            const hasPolitical = myPolitical.length > 0 || (isFree && featured.length > 0) || (!isFree && publicPolitical.length > 0);
            if (!hasPolitical) return null;
            return (
              <>
                <h2 className="text-lg font-semibold text-gray-300 mb-4">Public Policy / Political</h2>
                {/* My political topics */}
                {user && myPolitical.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {myPolitical.map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                )}
                {/* Featured political topics for free users */}
                {isFree && featured.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {featured.filter((t) => !myTopics[t.slug]).map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                )}
                {/* Public political topics for paid users */}
                {!isFree && publicPolitical.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {publicPolitical.map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                )}
                <div className="mb-8" />
              </>
            );
          })()}

          {/* Company / Brand section */}
          {(() => {
            const featuredCompany = topics.filter((t) => t.featured && t.topic_type === "company");
            const isFree = user && user.tier === "free";
            const hasCompany = myCompany.length > 0 || (isFree && featuredCompany.length > 0) || (!isFree && publicCompany.length > 0);
            if (!hasCompany) return null;
            return (
              <>
                <h2 className="text-lg font-semibold text-gray-300 mb-4">Company / Brand</h2>
                {/* My company topics */}
                {user && myCompany.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {myCompany.map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                )}
                {/* Featured company topics for free users */}
                {isFree && featuredCompany.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {featuredCompany.filter((t) => !myTopics[t.slug]).map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                )}
                {/* Public company topics for paid users */}
                {!isFree && publicCompany.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {publicCompany.map((topic) => (
                      <TopicCard key={topic.slug} topic={topic} />
                    ))}
                  </div>
                )}
                <div className="mb-8" />
              </>
            );
          })()}

          {/* Add New Topic card — show when user has no topics */}
          {user && myTopicsList.length === 0 && user.tier !== "free" && (
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
            </div>
          )}
          {user && myTopicsList.length === 0 && user.tier === "free" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Link
                href="/topics/new"
                className="block bg-gray-900 border border-dashed border-gray-700 rounded-xl p-4 sm:p-6 hover:border-gray-500 transition-colors flex items-center justify-center"
              >
                <div className="text-center">
                  <div className="text-2xl text-gray-600 mb-1">+</div>
                  <h2 className="text-base font-semibold text-gray-400">Add New Topic</h2>
                  <p className="text-gray-600 text-xs mt-1">1 free custom topic</p>
                </div>
              </Link>
            </div>
          )}
        </>
      )}

    </main>
  );
}
