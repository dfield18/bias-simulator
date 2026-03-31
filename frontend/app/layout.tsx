import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Echo — See How Political Bias Shapes Your Feed",
    template: "%s — Echo",
  },
  description: "Analyze any political topic from both sides. Echo uses AI to classify thousands of tweets, map narrative frames, and reveal the echo chambers that algorithms create.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Echo — See How Political Bias Shapes Your Feed",
    description: "Analyze any political topic from both sides. AI-powered tweet classification, narrative analysis, and echo chamber detection.",
    siteName: "Echo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Echo — See How Political Bias Shapes Your Feed",
    description: "Analyze any political topic from both sides. AI-powered tweet classification, narrative analysis, and echo chamber detection.",
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
        </body>
      </html>
    </ClerkProvider>
  );
}
