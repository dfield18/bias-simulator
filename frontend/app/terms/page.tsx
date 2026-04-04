import Link from "next/link";

export const metadata = { title: "Terms of Service — DividedView" };

export default function TermsOfService() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-8 inline-block">&larr; Back</Link>
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: March 31, 2026</p>

      <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">1. Agreement to Terms</h2>
          <p>
            By accessing or using DividedView (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. DividedView is operated by DividedView (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">2. Description of Service</h2>
          <p>
            DividedView is a platform that analyzes publicly available social media posts to visualize political bias, narrative framing, and echo chamber dynamics. The Service uses artificial intelligence to classify content and generate analytical dashboards. All classifications are algorithmic estimates and should not be treated as definitive editorial judgments.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">3. Accounts</h2>
          <p className="mb-3">
            You must create an account to use DividedView. You are responsible for maintaining the security of your account credentials and for all activity under your account.
          </p>
          <p>
            You must provide accurate information when creating your account. We reserve the right to suspend or terminate accounts that violate these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">4. Subscriptions and Billing</h2>
          <p className="mb-3">
            DividedView offers free and paid subscription tiers. Free accounts are subject to usage limits. Paid subscriptions are billed through Stripe on a recurring basis.
          </p>
          <p className="mb-3">
            You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period. We do not provide prorated refunds for partial billing periods.
          </p>
          <p>
            We reserve the right to change pricing with 30 days&apos; notice. Price changes will not affect your current billing period.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">5. Acceptable Use</h2>
          <p className="mb-3">You agree not to:</p>
          <ul className="list-disc list-inside space-y-1.5 text-gray-400">
            <li>Use DividedView to harass, threaten, or target individuals identified in the analysis</li>
            <li>Scrape, resell, or redistribute DividedView&apos;s data or analysis without permission</li>
            <li>Circumvent usage limits, rate limits, or access controls</li>
            <li>Use automated tools to access the Service beyond normal browser use</li>
            <li>Misrepresent AI-generated classifications as human editorial judgments</li>
            <li>Use DividedView for any purpose that violates applicable law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">6. Intellectual Property</h2>
          <p className="mb-3">
            The DividedView platform, including its design, code, AI models, and analytical methodologies, is owned by DividedView. Your use of the Service does not grant you ownership of any intellectual property.
          </p>
          <p>
            Topics you create and any custom configuration (search queries, classification prompts) are associated with your account. Public topics may be viewed and subscribed to by other users.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">7. Social Media Content</h2>
          <p>
            DividedView analyzes publicly available social media posts. We do not claim ownership of this content. The display of tweets within DividedView is for analytical purposes. DividedView is not affiliated with, endorsed by, or sponsored by X (formerly Twitter) or any other social media platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">8. AI Disclaimer</h2>
          <p>
            DividedView uses artificial intelligence to classify political stance, intensity, narrative framing, and emotional tone. These classifications are estimates and may contain errors. DividedView does not guarantee the accuracy of any AI-generated analysis. Users should treat all classifications as approximations, not as authoritative assessments of any individual&apos;s or organization&apos;s political views.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">9. Limitation of Liability</h2>
          <p>
            DividedView is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied. To the maximum extent permitted by law, DividedView shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or reputation, arising from your use of the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">10. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless DividedView from any claims, damages, or expenses arising from your use of the Service or your violation of these Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">11. Termination</h2>
          <p>
            We may suspend or terminate your access to DividedView at any time for violation of these Terms or for any reason with reasonable notice. Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination (including limitations of liability and indemnification) will remain in effect.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">12. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes by posting the updated terms on this page. Continued use of DividedView after changes constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">13. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the United States. Any disputes shall be resolved in the courts of competent jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">14. Contact</h2>
          <p>
            Questions about these Terms? Contact us at <a href="mailto:davidcharlesfield@gmail.com" className="text-blue-400 hover:text-blue-300">davidcharlesfield@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
