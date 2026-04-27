"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GA_ID = "G-EVZ0CK3P4G";
const AW_ID = "AW-18069178143";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstLoad = useRef(true);

  // Listen for cookie consent and upgrade GA tracking
  useEffect(() => {
    const updateConsent = () => {
      const accepted = localStorage.getItem("cookie-consent") === "accepted";
      if (window.gtag) {
        window.gtag("consent", "update", {
          analytics_storage: accepted ? "granted" : "denied",
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

  // Track client-side route changes
  useEffect(() => {
    if (!window.gtag) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    const url = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${url}`,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  // Skip Clerk internal pages (service worker iframes)
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/_/")) {
    return null;
  }

  // Always render — GA loads in consent mode (denied by default),
  // upgrades to full tracking when user accepts cookies
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}');
        gtag('config', '${AW_ID}');
      `}</Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${AW_ID}`} strategy="afterInteractive" />
    </>
  );
}
