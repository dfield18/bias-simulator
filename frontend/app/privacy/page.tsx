import Link from "next/link";

export const metadata = { title: "Privacy Policy — Echo" };

export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 mb-8 inline-block">&larr; Back</Link>
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last updated: March 31, 2026</p>

      <div className="space-y-8 text-sm text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">1. Who We Are</h2>
          <p>
            Echo (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the Echo platform, a service that analyzes public social media posts to visualize political bias and narrative framing. This Privacy Policy explains how we collect, use, and protect your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">2. Information We Collect</h2>
          <p className="mb-3"><strong className="text-gray-100">Account information:</strong> When you create an account, we collect your name and email address through our authentication provider (Clerk). If you subscribe to a paid plan, payment information is processed by Stripe — we do not store your credit card details.</p>
          <p className="mb-3"><strong className="text-gray-100">Usage data:</strong> We collect information about how you use Echo, including topics you create or subscribe to, pipeline runs, and feature interactions. This helps us improve the product and enforce usage limits.</p>
          <p className="mb-3"><strong className="text-gray-100">Social media data:</strong> Echo collects publicly available tweets related to topics you analyze. This data includes tweet text, author usernames, engagement metrics, and media attachments. We do not collect private or protected tweets. This data is used solely for analysis within the platform.</p>
          <p><strong className="text-gray-100">AI classifications:</strong> Tweets are processed by artificial intelligence models to generate political stance classifications, intensity scores, narrative framing, and emotional tone. These are algorithmic estimates, not editorial judgments.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-1.5 text-gray-400">
            <li>To provide and maintain the Echo platform</li>
            <li>To authenticate your identity and manage your account</li>
            <li>To process payments and manage subscriptions</li>
            <li>To enforce usage limits based on your subscription tier</li>
            <li>To improve our AI classification accuracy and product features</li>
            <li>To send service-related communications (e.g., account changes, billing)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">4. Data Sharing</h2>
          <p className="mb-3">We do not sell your personal information. We share data only with the following categories of service providers who help us operate Echo:</p>
          <ul className="list-disc list-inside space-y-1.5 text-gray-400">
            <li><strong className="text-gray-300">Clerk</strong> — authentication and user management</li>
            <li><strong className="text-gray-300">Stripe</strong> — payment processing</li>
            <li><strong className="text-gray-300">AI providers</strong> — tweet classification (tweet text is sent to AI models for analysis; no personal user data is shared)</li>
            <li><strong className="text-gray-300">Infrastructure providers</strong> — hosting and database services</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">5. Data Retention</h2>
          <p>
            Account data is retained for as long as your account is active. Tweet data associated with topics is retained to provide ongoing analysis. If you delete your account, your personal data will be removed within 30 days. Aggregated, anonymized analytics data may be retained indefinitely.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">6. Your Rights</h2>
          <p className="mb-3">Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc list-inside space-y-1.5 text-gray-400">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Object to or restrict certain processing</li>
            <li>Export your data in a portable format</li>
          </ul>
          <p className="mt-3">To exercise any of these rights, contact us at <a href="mailto:davidcharlesfield@gmail.com" className="text-blue-400 hover:text-blue-300">davidcharlesfield@gmail.com</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">7. Cookies</h2>
          <p>
            Echo uses essential cookies for authentication (managed by Clerk). We do not use advertising or tracking cookies. No third-party analytics cookies are set.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">8. Security</h2>
          <p>
            We use industry-standard measures to protect your data, including encrypted connections (HTTPS), secure authentication, and access controls on our databases. However, no system is completely secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">9. Children</h2>
          <p>
            Echo is not intended for use by anyone under the age of 13. We do not knowingly collect personal information from children.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page with a revised date.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-100 mb-3">11. Contact</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at <a href="mailto:davidcharlesfield@gmail.com" className="text-blue-400 hover:text-blue-300">davidcharlesfield@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
