"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { setAuthToken, setGetTokenFn } from "@/lib/api";

/**
 * Syncs the Clerk session token into our API module so all
 * fetch calls automatically include the Authorization header.
 * Blocks rendering of children until the first token sync completes.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    // If not signed in, no token to sync — just render
    if (!isSignedIn) {
      setAuthToken(null);
      setGetTokenFn(null);
      setReady(true);
      return;
    }

    // Store getToken so apiFetch can get fresh tokens on each call
    setGetTokenFn(getToken);

    let cancelled = false;

    async function syncToken() {
      try {
        const token = await getToken();
        if (!cancelled) {
          setAuthToken(token);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setAuthToken(null);
          setReady(true);
        }
      }
    }

    syncToken();

    // Refresh token periodically (Clerk tokens expire after ~60s)
    const interval = setInterval(syncToken, 50_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getToken, isLoaded, isSignedIn]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
