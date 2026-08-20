"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full">
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Something went wrong.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              The application could not be loaded. Please try again.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
