"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const GA_ID = "G-EVZ0CK3P4G";

export default function GoogleAnalytics() {
  const [consented, setConsented] = useState(false);

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

  // Also listen for same-tab consent changes via custom event
  useEffect(() => {
    const handler = () => {
      if (localStorage.getItem("cookie-consent") === "accepted") {
        setConsented(true);
      }
    };
    window.addEventListener("cookie-consent-change", handler);
    return () => window.removeEventListener("cookie-consent-change", handler);
  }, []);

  if (!consented) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}');
      `}</Script>
    </>
  );
}
