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
      <nav className="bg-gray-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between">
          <div className="text-base font-semibold tracking-tight text-gray-100">echo</div>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm px-4 py-1.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 pt-20 sm:pt-32 pb-20 sm:pb-28">
        <div className="max-w-2xl">
          <p className="text-sm text-gray-500 mb-4 tracking-wide">Political media analysis</p>
          <h1 className="text-4xl sm:text-[3.5rem] font-bold leading-[1.1] mb-6 tracking-tight">
            The same story.<br />
            Two different realities.
          </h1>
          <p className="text-base sm:text-lg text-gray-400 mb-10 leading-relaxed max-w-lg">
            Echo analyzes thousands of tweets on any political topic and shows you
            how each side frames, argues, and ignores the same events.
          </p>
          <Link
            href="/sign-up"
            className="inline-block px-6 py-2.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
          >
            Try it free
          </Link>
        </div>

        {/* Visual — stylized blue/red split */}
        <div className="mt-16 sm:mt-20 relative">
          <div className="grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-gray-800/60">
            {/* Left side (blue) */}
            <div className="bg-gray-900/80 p-5 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[11px] text-blue-400 font-medium tracking-wide uppercase">Side A</span>
              </div>
              <div className="space-y-3">
                <div className="h-2.5 bg-blue-500/20 rounded-full w-full" />
                <div className="h-2.5 bg-blue-500/15 rounded-full w-4/5" />
                <div className="h-2.5 bg-blue-500/10 rounded-full w-3/5" />
                <div className="h-2.5 bg-blue-500/8 rounded-full w-2/5" />
              </div>
              <div className="mt-6 flex gap-2">
                <span className="text-[10px] bg-blue-500/10 text-blue-400/70 px-2 py-0.5 rounded">security</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400/70 px-2 py-0.5 rounded">economy</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400/70 px-2 py-0.5 rounded">law</span>
              </div>
            </div>
            {/* Right side (red) */}
            <div className="bg-gray-900/80 p-5 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[11px] text-red-400 font-medium tracking-wide uppercase">Side B</span>
              </div>
              <div className="space-y-3">
                <div className="h-2.5 bg-red-500/20 rounded-full w-full" />
                <div className="h-2.5 bg-red-500/15 rounded-full w-3/4" />
                <div className="h-2.5 bg-red-500/10 rounded-full w-1/2" />
                <div className="h-2.5 bg-red-500/8 rounded-full w-1/3" />
              </div>
              <div className="mt-6 flex gap-2">
                <span className="text-[10px] bg-red-500/10 text-red-400/70 px-2 py-0.5 rounded">rights</span>
                <span className="text-[10px] bg-red-500/10 text-red-400/70 px-2 py-0.5 rounded">justice</span>
                <span className="text-[10px] bg-red-500/10 text-red-400/70 px-2 py-0.5 rounded">equity</span>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-gray-600 bg-gray-950 px-3">
            same topic, different framing
          </div>
        </div>
      </section>

      {/* What Echo shows you — staggered, not a grid */}
      <section className="border-t border-gray-800/30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <p className="text-sm text-gray-500 mb-10 tracking-wide">What you get</p>

          <div className="space-y-12 sm:space-y-16">
            {/* Feature 1 */}
            <div className="max-w-lg">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Simulated feed with bias control</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Drag a slider from left to right and watch the feed transform. See exactly what
                someone in each echo chamber would see on any given day.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="max-w-lg sm:ml-auto">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Narrative breakdown</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Which arguments does each side reach for? Which do they ignore?
                Radar charts, emotional tone analysis, and rhetoric intensity scoring
                show the full picture.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="max-w-lg">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Same story, different lens</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                When both sides cover the same event, Echo pairs their tweets side by side
                so you can see how framing changes the story.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="max-w-lg sm:ml-auto">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Echo chamber detection</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                A single score measuring how separated the two sides are — based on shared sources,
                overlapping arguments, and cross-side engagement.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — minimal, not numbered */}
      <section className="border-t border-gray-800/30 bg-gray-900/20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <p className="text-sm text-gray-500 mb-10 tracking-wide">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1.5">Enter a topic</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Type any political issue. Echo generates the classification framework for you.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1.5">AI classifies tweets</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Thousands of real tweets are pulled and analyzed for stance, intensity, and framing.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-1.5">Explore the results</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Interactive dashboards, side-by-side comparisons, and the full narrative map.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-800/30">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">See what both sides are saying.</h2>
          <p className="text-gray-500 mb-8 text-sm">Free to start. No credit card required.</p>
          <Link
            href="/sign-up"
            className="inline-block px-6 py-2.5 bg-white text-gray-950 rounded-md font-medium hover:bg-gray-200 transition-colors text-sm"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/30 py-8">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div>echo</div>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-gray-400 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
            <Link href="/sign-in" className="hover:text-gray-400 transition-colors">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
