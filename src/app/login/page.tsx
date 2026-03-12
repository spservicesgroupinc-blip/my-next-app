"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset">("signin");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    setIsLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      {/* Logo / Brand */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-600 rounded-2xl mb-4 shadow-lg">
          <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">ProTask</h1>
        <p className="text-sm text-gray-500 mt-1">Contractor Field Management</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {mode === "signin" ? (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign in to your account</h2>

            {error && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                {isLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <button
              onClick={() => { setMode("reset"); setError(null); }}
              className="mt-4 w-full text-center text-sm text-orange-600 hover:text-orange-700"
            >
              Forgot password?
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Reset your password</h2>
            <p className="text-sm text-gray-500 mb-6">
              Enter your email and we&apos;ll send a reset link.
            </p>

            {resetSent ? (
              <div className="px-3 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Check your email for a password reset link.
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                  </div>
                )}
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reset-email">
                      Email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-colors"
                  >
                    {isLoading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              </>
            )}

            <button
              onClick={() => { setMode("signin"); setError(null); setResetSent(false); }}
              className="mt-4 w-full text-center text-sm text-orange-600 hover:text-orange-700"
            >
              ← Back to sign in
            </button>
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Contact your admin if you need an account.
      </p>
    </div>
  );
}
