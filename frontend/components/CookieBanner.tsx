"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie-consent")) {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          This site uses cookies for authentication and analytics.
          By continuing to use DividedView, you agree to our{" "}
          <Link href="/privacy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link>.
        </p>
        <button
          onClick={accept}
          className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-xs font-medium transition-colors shrink-0"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
