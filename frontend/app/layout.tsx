import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import AuthProvider from "@/components/AuthProvider";
import { Suspense } from "react";
import CookieBanner from "@/components/CookieBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DividedView — See How Political Bias Shapes Your Feed",
    template: "%s — DividedView",
  },
  description: "DividedView uses AI to analyze real posts from X on any political topic, showing how each side frames the same events. Simulated feeds, narrative analysis, and blind spot detection.",
  keywords: ["political bias", "media bias", "echo chamber", "narrative analysis", "political feed simulator", "X posts analysis", "AI classification", "divided view", "political media"],
  icons: { icon: "/favicon.svg" },
  metadataBase: new URL("https://www.dividedview.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "DividedView — See How Political Bias Shapes Your Feed",
    description: "DividedView uses AI to analyze real posts from X on any political topic, showing how each side frames the same events. Simulated feeds, narrative analysis, and blind spot detection.",
    siteName: "DividedView",
    url: "https://www.dividedview.com",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "DividedView — See How Political Bias Shapes Your Feed",
    description: "DividedView uses AI to analyze real posts from X on any political topic. Simulated feeds, echo chamber detection, and narrative analysis.",
    site: "@dividedview",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={{
      baseTheme: dark,
      variables: { colorPrimary: "#3b82f6" },
      elements: {
        card: "bg-gray-900 border-gray-700",
        headerTitle: "text-gray-100",
        headerSubtitle: "text-gray-400",
        socialButtonsBlockButton: "bg-gray-800 border-gray-700 text-gray-200",
        formFieldInput: "bg-gray-800 border-gray-700 text-gray-100",
        footerActionLink: "text-blue-400",
      },
    }}>
      <html lang="en">
        <head>
          {/* Consent defaults MUST be set before GTM loads */}
          <script dangerouslySetInnerHTML={{ __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('consent', 'default', {
              analytics_storage: 'denied',
              ad_storage: 'denied',
              wait_for_update: 500
            });
            if (typeof localStorage !== 'undefined' && localStorage.getItem('cookie-consent') === 'accepted') {
              gtag('consent', 'update', {
                analytics_storage: 'granted',
                ad_storage: 'granted'
              });
            }
          `}} />
          {/* GTM loads after consent defaults are set — skip Clerk iframes */}
          <script dangerouslySetInnerHTML={{ __html: `
            if (!window.location.pathname.startsWith('/_/')) {
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-5WJ9564T');
            }
          `}} />
        </head>
        <body className="bg-gray-950 text-gray-100 min-h-screen">
          {/* GTM noscript fallback */}
          <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5WJ9564T" height="0" width="0" style={{ display: "none", visibility: "hidden" }} /></noscript>
          <AuthProvider>{children}</AuthProvider>
          <CookieBanner />
          <Suspense fallback={null}><GoogleAnalytics /></Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
