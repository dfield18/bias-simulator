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

        {/* Product preview — three panels */}
        <div className="mt-16 sm:mt-20 grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Panel 1: Mini feed — scrollable */}
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 lg:col-span-1 flex flex-col">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Simulated Feed</div>
            <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1 scrollbar-thin">
              {[
                { name: "Reuters", handle: "@Reuters", text: "Border patrol reports record crossings as asylum policy debate intensifies in Congress ahead of midterms.", bent: "neutral", color: "bg-gray-500/20 text-gray-400" },
                { name: "Rep. Garcia", handle: "@RepGarcia", text: "These families are fleeing violence. We need a humane path, not more walls and cages.", bent: "pro-immigration", color: "bg-blue-500/20 text-blue-400" },
                { name: "Daily Wire", handle: "@DailyWire", text: "EXPOSED: Sanctuary cities quietly release hundreds of criminal migrants back into communities.", bent: "border-security", color: "bg-red-500/20 text-red-400" },
                { name: "ACLU", handle: "@ACLU", text: "Reminder: seeking asylum is legal. Criminalizing refugees doesn't make anyone safer — it just makes us crueler.", bent: "pro-immigration", color: "bg-blue-500/20 text-blue-400" },
                { name: "Fox News", handle: "@FoxNews", text: "Texas Governor deploys additional National Guard troops to southern border amid record surge.", bent: "border-security", color: "bg-red-500/20 text-red-400" },
                { name: "AP News", handle: "@AP", text: "New DHS data shows migrant encounters down 40% from peak but remain above historical averages.", bent: "neutral", color: "bg-gray-500/20 text-gray-400" },
                { name: "Sen. Warren", handle: "@SenWarren", text: "Children don't belong in detention centers. Period. We must end family separation once and for all.", bent: "pro-immigration", color: "bg-blue-500/20 text-blue-400" },
                { name: "Breitbart", handle: "@BreitbartNews", text: "Illegal immigrant crime wave: three more arrests this week in cities that refused to cooperate with ICE.", bent: "border-security", color: "bg-red-500/20 text-red-400" },
                { name: "The Economist", handle: "@TheEconomist", text: "Immigration's economic impact is more nuanced than either side admits — new data shows mixed effects on wages.", bent: "neutral", color: "bg-gray-500/20 text-gray-400" },
                { name: "Rep. Ocasio-Cortez", handle: "@AOC", text: "No human being is illegal. Our immigration system is broken, and cruelty is not the fix.", bent: "pro-immigration", color: "bg-blue-500/20 text-blue-400" },
              ].map((t, i) => (
                <div key={i} className="border border-gray-800/40 rounded-lg p-2.5 shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-medium text-gray-200 truncate">{t.name}</span>
                      <span className="text-[10px] text-gray-600 truncate">{t.handle}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ml-2 ${t.color}`}>{t.bent}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">{t.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 2: Echo Chamber Score + key stats */}
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex flex-col">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Echo Chamber Score</div>
            <div className="text-xs text-gray-400 mb-5">US Immigration — 1,247 tweets analyzed</div>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-5xl font-bold text-orange-400 mb-1">23%</div>
              <div className="text-xs text-gray-500 mb-4">overlap between sides</div>
              {/* Gauge bar */}
              <div className="w-full max-w-[200px] h-2 rounded-full bg-gray-800 mb-1.5">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-green-500" style={{ width: "23%" }} />
              </div>
              <div className="flex justify-between w-full max-w-[200px] text-[9px] text-gray-600 mb-6">
                <span>Echo chamber</span>
                <span>Shared conversation</span>
              </div>
              {/* Key metrics */}
              <div className="w-full space-y-2.5">
                {[
                  { label: "Shared sources", value: "3 of 24", sub: "publishers" },
                  { label: "Shared arguments", value: "4 of 8", sub: "narrative frames" },
                  { label: "Cross-side engagement", value: "7%", sub: "of replies" },
                ].map((m) => (
                  <div key={m.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{m.label}</span>
                    <div className="text-right">
                      <span className="text-[11px] text-gray-200 font-medium">{m.value}</span>
                      <span className="text-[9px] text-gray-600 ml-1">{m.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Panel 3: What each side argues (butterfly) */}
          <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 flex flex-col">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-medium">What Each Side Argues</div>
            <div className="flex items-center justify-between mb-2 mt-1">
              <span className="text-[9px] text-blue-400">Pro-Immigration</span>
              <span className="text-[9px] text-red-400">Border Security</span>
            </div>
            <div className="flex-1 flex flex-col justify-center space-y-3">
              {[
                { label: "Human Rights", anti: 85, pro: 12 },
                { label: "Security", anti: 15, pro: 92 },
                { label: "Economy", anti: 45, pro: 68 },
                { label: "Rule of Law", anti: 20, pro: 78 },
                { label: "Family", anti: 72, pro: 8 },
                { label: "Crime", anti: 5, pro: 88 },
                { label: "Culture", anti: 60, pro: 30 },
                { label: "Public Health", anti: 10, pro: 55 },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-1">
                  <div className="w-[33%] flex justify-end">
                    <div className="h-4 bg-blue-500/40 rounded-l-sm" style={{ width: `${f.anti}%` }} />
                  </div>
                  <div className="w-[34%] text-center">
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">{f.label}</span>
                  </div>
                  <div className="w-[33%] flex justify-start">
                    <div className="h-4 bg-red-500/40 rounded-r-sm" style={{ width: `${f.pro}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 text-center mt-3">Sample data from US Immigration analysis</p>
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
