"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GA_ID = "G-EVZ0CK3P4G";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstLoad = useRef(true);

  // Listen for cookie consent and upgrade ad tracking
  useEffect(() => {
    const updateConsent = () => {
      const accepted = localStorage.getItem("cookie-consent") === "accepted";
      if (window.gtag) {
        window.gtag("consent", "update", {
          ad_storage: accepted ? "granted" : "denied",
        });
      }
    };

    const handler = () => updateConsent();
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "cookie-consent") updateConsent();
    };
    window.addEventListener("cookie-consent-change", handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("cookie-consent-change", handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  // Track SPA route changes — use gtag('config') to properly update
  // GA4's internal page state and reset the engagement timer
  useEffect(() => {
    if (!window.gtag) return;
    // Skip initial mount — the inline script in <head> already sent the first page_view
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    const url = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;

    // gtag('config', ...) updates the tracker state AND sends a page_view,
    // which properly closes the engagement timer for the previous page.
    // gtag('event', 'page_view', ...) only sends a raw event without
    // resetting the engagement timer — causing 0s engagement on SPA navigations.
    window.gtag("config", GA_ID, {
      page_path: pathname,
      page_location: `${window.location.origin}${url}`,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  // Skip Clerk internal pages
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/_/")) {
    return null;
  }

  return null;
}
