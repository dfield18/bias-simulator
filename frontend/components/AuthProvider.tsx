"use client";

import { useEffect, useState, useRef } from "react";
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
  const hasBeenSignedIn = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    // Track if we've ever seen a signed-in state in this session
    if (isSignedIn) {
      hasBeenSignedIn.current = true;
    }

    if (!isSignedIn) {
      if (hasBeenSignedIn.current) {
        // Was signed in before — likely a brief reload flicker. Wait for
        // Clerk to restore the session rather than rendering without auth.
        return;
      }
      // Never been signed in — this is the landing page or sign-in flow
      setAuthToken(null);
      setGetTokenFn(null);
      setReady(true);
      return;
    }

    // Signed in — sync token
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

  // Safety timeout: if nothing resolves after 5 seconds, render anyway
  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(() => {
      if (!ready) setReady(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [ready]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
