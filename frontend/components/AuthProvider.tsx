"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setAuthToken } from "@/lib/api";

/**
 * Syncs the Clerk session token into our API module so all
 * fetch calls automatically include the Authorization header.
 * Render this once near the top of your component tree.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function syncToken() {
      try {
        const token = await getToken();
        if (!cancelled) setAuthToken(token);
      } catch {
        if (!cancelled) setAuthToken(null);
      }
    }

    syncToken();

    // Refresh token periodically (Clerk tokens expire after ~60s)
    const interval = setInterval(syncToken, 50_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getToken, isLoaded]);

  return <>{children}</>;
}
