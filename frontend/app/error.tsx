"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="text-6xl font-bold text-gray-700 mb-4">500</div>
        <h1 className="text-xl font-semibold text-gray-200 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
