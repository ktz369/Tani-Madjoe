"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/auth";
import AuthGuard from "@/components/layout/AuthGuard";
import { 
  Sprout, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ArrowRight, 
  KeyRound,
  ShieldCheck
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Harap isi alamat email dan kata sandi.");
      return;
    }

    try {
      setLoading(true);
      await login({
        email: email.trim(),
        password: password,
      });

      // Redirect to target URL or default home
      router.push(redirectUrl);
    } catch (err: any) {
      console.error("Kesalahan saat login:", err);
      const serverMessage = err.response?.data?.detail;
      if (typeof serverMessage === "string") {
        setError(serverMessage);
      } else if (Array.isArray(serverMessage) && serverMessage.length > 0) {
        setError(serverMessage[0].msg || "Format input tidak valid.");
      } else {
        setError("Gagal masuk. Periksa kembali email dan kata sandi Anda.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = () => {
    setEmail("admin@tani.local");
    setPassword("admin123");
    setError(null);
  };

  return (
    <AuthGuard requireAuth={false}>
      <main className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-100 rounded-full blur-3xl opacity-60 pointer-events-none" />

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
          {/* Logo & Header */}
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-200">
              <Sprout className="w-8 h-8" />
            </div>
          </div>
          <h2 className="mt-5 text-center text-3xl font-extrabold tracking-tight text-slate-900">
            Masuk ke Tani
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Platform Pemantauan Pertanian & Analisis Satelit Terpadu
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
          <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 rounded-2xl border border-slate-200 sm:px-10">
            {/* Error Notification */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 animate-in fade-in duration-200">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Autentikasi Gagal</p>
                  <p className="text-xs text-rose-700 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {/* Email Input */}
              <div>
                <label 
                  htmlFor="email" 
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Alamat Email
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    className="block w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-colors"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label 
                  htmlFor="password" 
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Kata Sandi
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      <span>Memverifikasi...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>Masuk Sekarang</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Demo Credentials Box */}
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-100/80 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <p className="font-semibold text-emerald-900">Kredensial Default Sistem</p>
                  <p className="text-emerald-700 mt-0.5">
                    Email: <span className="font-mono font-medium">admin@tani.local</span>
                  </p>
                  <p className="text-emerald-700">
                    Kata Sandi: <span className="font-mono font-medium">admin123</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleQuickFill}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline decoration-emerald-400 underline-offset-2"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Isi Form Otomatis
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 mt-6">
            © 2026 Tani SaaS Platform. Seluruh hak cipta dilindungi.
          </p>
        </div>
      </main>
    </AuthGuard>
  );
}
