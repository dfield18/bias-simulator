import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import AuthProvider from "@/components/AuthProvider";
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
        <body className="bg-gray-950 text-gray-100 min-h-screen">
          <AuthProvider>{children}</AuthProvider>
          <CookieBanner />
          <GoogleAnalytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
