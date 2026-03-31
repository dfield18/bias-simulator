"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-800/50 bg-gray-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="text-lg font-bold text-gray-100">Political Feed Simulator</div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16">
        <div className="max-w-3xl">
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-6">
            See how political bias shapes
            <span className="text-blue-400"> what you see</span> on Twitter
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 mb-8 leading-relaxed">
            Analyze any political topic from both sides. Our AI classifies thousands of tweets,
            maps narrative frames, and reveals the echo chambers that algorithms create.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/sign-up"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-center transition-colors"
            >
              Start Analyzing Free
            </Link>
            <a
              href="#how-it-works"
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium text-center transition-colors"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-gray-800/50 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Pick a topic",
                desc: "Enter any political issue — immigration, AI regulation, gun control — and our AI generates the classification framework automatically.",
              },
              {
                step: "2",
                title: "AI analyzes tweets",
                desc: "We pull thousands of real tweets, classify each one's political stance, intensity, narrative frame, and emotional tone using a multi-model AI pipeline.",
              },
              {
                step: "3",
                title: "Explore both sides",
                desc: "See a simulated feed with a bias slider, analytics dashboards, echo chamber analysis, and side-by-side story comparisons.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 text-blue-400 text-lg font-bold flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center">What You Get</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Simulated Feed",
                desc: "Drag a bias slider from left to right and watch how your feed changes in real time.",
              },
              {
                title: "Narrative Analysis",
                desc: "Radar charts showing which arguments each side uses — and which they ignore.",
              },
              {
                title: "Echo Chamber Score",
                desc: "Quantifies how much overlap exists between the two sides' information sources.",
              },
              {
                title: "Key Voices",
                desc: "Who's shaping the conversation on each side, ranked by engagement and reach.",
              },
              {
                title: "Flashpoints",
                desc: "Tweets that triggered the other side — the posts that sparked cross-aisle outrage.",
              },
              {
                title: "Same Story, Different Lens",
                desc: "See how both sides cover the same event with completely different framing.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5"
              >
                <h3 className="text-sm font-semibold text-gray-200 mb-2">{f.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-800/50 bg-gray-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to see behind the algorithm?</h2>
          <p className="text-gray-400 mb-8 max-w-lg mx-auto">
            Create your first topic in under a minute. No credit card required.
          </p>
          <Link
            href="/sign-up"
            className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div>Political Feed Simulator</div>
          <div className="flex gap-4">
            <Link href="/sign-in" className="hover:text-gray-400">Log in</Link>
            <Link href="/sign-up" className="hover:text-gray-400">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
