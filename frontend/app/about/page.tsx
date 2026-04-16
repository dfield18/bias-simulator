import Link from "next/link";

export const metadata = {
  title: "About DividedView",
  description: "DividedView is an AI-powered political media and brand sentiment analysis platform built by BrooklynEcho LLC. Learn how it works, who built it, and why.",
};

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-8 inline-block">&larr; Back</Link>
      <h1 className="text-3xl font-bold mb-6">About DividedView</h1>

      <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">What is DividedView?</h2>
          <p className="mb-3">
            DividedView is an AI-powered analysis platform that shows how political bias and brand sentiment shape public discourse on X (formerly Twitter). It pulls real posts on any topic, classifies them by political leaning or consumer sentiment using AI, and presents interactive dashboards that reveal how each side frames the same events differently.
          </p>
          <p>
            The platform supports two analysis modes: <strong className="text-gray-100">Public Policy and Political topics</strong> (e.g., immigration, AI regulation, elections) where posts are classified on a left-right political spectrum, and <strong className="text-gray-100">Company and Brand topics</strong> (e.g., Tesla, Nike, Meta) where posts are classified by positive or negative consumer sentiment.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">How It Works</h2>
          <ol className="list-decimal list-inside space-y-3 text-gray-400">
            <li>
              <strong className="text-gray-200">Collect</strong> &mdash; DividedView pulls thousands of real posts from X matching your topic&apos;s search query, ranked by engagement and relevance.
            </li>
            <li>
              <strong className="text-gray-200">Classify</strong> &mdash; Each post is analyzed by AI to determine political stance (or brand sentiment), intensity on a -10 to +10 scale, narrative framing, and emotional tone.
            </li>
            <li>
              <strong className="text-gray-200">Analyze</strong> &mdash; The platform generates interactive dashboards with simulated feeds, narrative comparisons, echo chamber scoring, blind spot detection, geographic distribution, key voice analysis, and actionable insights.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Key Features</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li><strong className="text-gray-200">Simulated Feed</strong> &mdash; See how a feed algorithm prioritizes content based on political leaning. Drag the bias slider to explore different echo chambers.</li>
            <li><strong className="text-gray-200">Narrative Analysis</strong> &mdash; Understand what arguments each side uses, which narrative frames get the most traction, and what stories each side misses entirely.</li>
            <li><strong className="text-gray-200">Echo Chamber Scoring</strong> &mdash; Measure the overlap between opposing perspectives. A low score means each side is essentially in a separate conversation.</li>
            <li><strong className="text-gray-200">Geographic Mapping</strong> &mdash; Visualize where posts come from across US states and international locations, with sentiment breakdowns by region.</li>
            <li><strong className="text-gray-200">Brand Sentiment</strong> &mdash; Analyze consumer sentiment for companies and brands, with filters for consumers, analysts, media, influencers, and more.</li>
            <li><strong className="text-gray-200">Flashpoints</strong> &mdash; Identify posts that triggered the other side through quote-tweets, high reply ratios, and cross-side engagement.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Who Built This</h2>
          <p className="mb-3">
            DividedView is built and operated by <strong className="text-gray-100">BrooklynEcho LLC</strong>, based in New York. The platform was created to help researchers, journalists, communications professionals, and curious citizens understand how political polarization and brand perception play out in real-time public discourse.
          </p>
          <p>
            We believe that understanding how information is framed &mdash; and what each side never sees &mdash; is essential to navigating today&apos;s fragmented media landscape.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">AI Transparency</h2>
          <p className="mb-3">
            DividedView uses artificial intelligence (Google Gemini) to classify posts by political stance, intensity, narrative framing, and emotional tone. All classifications are algorithmic estimates and may contain errors. Users should treat AI-generated analysis as approximations, not definitive assessments of any individual&apos;s or organization&apos;s views.
          </p>
          <p>
            The platform does not take political sides. It analyzes and presents both perspectives equally, letting users draw their own conclusions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Pricing</h2>
          <p className="mb-3">
            DividedView offers a <strong className="text-gray-100">free plan</strong> with access to preloaded topics, 1 custom topic, and 3 data refreshes per month. The <strong className="text-gray-100">Pro plan</strong> is available at $10/month for 100 custom topics, 100 runs, and priority support.
          </p>
          <p>
            <Link href="/pricing" className="text-blue-400 hover:text-blue-300">View full pricing details &rarr;</Link>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Contact</h2>
          <p>
            Questions, feedback, or partnership inquiries? Reach us at <a href="mailto:support@dividedview.com" className="text-blue-400 hover:text-blue-300">support@dividedview.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
