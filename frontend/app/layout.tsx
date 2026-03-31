import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Political Feed Simulator",
  description: "See how political bias shapes your Twitter feed",
  icons: { icon: "/favicon.svg" },
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
