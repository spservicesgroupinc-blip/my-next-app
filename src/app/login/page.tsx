"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DCFoamBrand } from "@/components/DCFoamLogo";

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
      <div className="mb-8">
        <DCFoamBrand />
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
                  className="w-full px-4 py-3.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-3.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl text-base transition-colors"
              >
                {isLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <button
              onClick={() => { setMode("reset"); setError(null); }}
              className="mt-4 w-full text-center text-sm text-blue-600 hover:text-blue-700"
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
                      className="w-full px-4 py-3.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl text-base transition-colors"
                  >
                    {isLoading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              </>
            )}

            <button
              onClick={() => { setMode("signin"); setError(null); setResetSent(false); }}
              className="mt-4 w-full text-center text-sm text-blue-600 hover:text-blue-700"
            >
              ← Back to sign in
            </button>
          </>
        )}
      </div>

      <p className="mt-6 text-sm text-gray-500">
        New company?{" "}
        <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
          Create an account
        </Link>
      </p>
    </div>
  );
}
