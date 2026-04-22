"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const GA_ID = "G-EVZ0CK3P4G";
const AW_ID = "AW-18069178143";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function GoogleAnalytics() {
  const [consented, setConsented] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (localStorage.getItem("cookie-consent") === "accepted") {
      setConsented(true);
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "cookie-consent" && e.newValue === "accepted") {
        setConsented(true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (localStorage.getItem("cookie-consent") === "accepted") {
        setConsented(true);
      }
    };
    window.addEventListener("cookie-consent-change", handler);
    return () => window.removeEventListener("cookie-consent-change", handler);
  }, []);

  useEffect(() => {
    if (!consented || !window.gtag) return;
    // Skip the first load — gtag('config') already sends a page_view
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
  }, [pathname, searchParams, consented]);

  if (!consented) return null;

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
