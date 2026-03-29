import type { Metadata } from "next";
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
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
