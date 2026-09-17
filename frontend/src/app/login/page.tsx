"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/auth";
import AuthGuard from "@/components/layout/AuthGuard";
import { 
  Sprout, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  ArrowRight, 
  KeyRound,
  ShieldCheck
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState<string>("admin@tani.local");
  const [password, setPassword] = useState<string>("admin123");
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
      <main className="min-h-screen bg-[var(--canvas)] flex items-center justify-center p-4">
        <div className="border border-black/[0.08] rounded-[3px] p-[34px] bg-white max-w-md w-full">
          {/* Brand Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-[3px] bg-[var(--field)] border border-black/[0.08] text-[var(--accent)] mb-3">
              <Sprout className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
              Masuk ke TANDUR
            </h1>
            <p className="mt-1 text-[13px] text-[var(--ink-2)]">
              Platform Pemantauan Pertanian & Analisis Satelit
            </p>
          </div>

          {/* Error Notification */}
          {error && (
            <div className="mb-5 p-3 rounded-[3px] bg-rose-50/70 border border-rose-200/80 text-rose-800 text-[12px] flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Autentikasi Gagal</p>
                <p className="text-[11px] text-rose-700 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Email Input */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-[12px] font-medium text-[var(--ink-2)] mb-1.5"
              >
                Alamat Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] text-[13px] focus:outline-none focus:border-[var(--accent)] bg-white text-[var(--ink)] transition-colors"
              />
            </div>

            {/* Password Input */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-[12px] font-medium text-[var(--ink-2)] mb-1.5"
              >
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-black/[0.08] rounded-[3px] h-[34px] px-[13px] pr-[34px] text-[13px] focus:outline-none focus:border-[var(--accent)] bg-white text-[var(--ink)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--ink-3)] hover:text-[var(--ink)] focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
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
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="h-[34px] px-[21px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[13px] font-medium w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                    <span>Memverifikasi...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Masuk Sekarang</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            </div>
          </form>

          {/* Demo Credentials Helper */}
          <div className="mt-6 pt-5 border-t border-black/[0.08]">
            <div className="p-3 bg-[var(--field)] rounded-[3px] border border-black/[0.08] flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)] flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-[12px]">
                <p className="font-semibold text-[var(--ink)]">Kredensial Default Sistem</p>
                <div className="mt-1 space-y-0.5 text-[var(--ink-2)] font-mono text-[11px]">
                  <p>Email: <span className="font-medium text-[var(--ink)]">admin@tani.local</span></p>
                  <p>Kata Sandi: <span className="font-medium text-[var(--ink)]">admin123</span></p>
                </div>
                <button
                  type="button"
                  onClick={handleQuickFill}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent-ink)] hover:underline"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Isi Form Otomatis</span>
                </button>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-[var(--ink-3)] mt-5">
            © 2026 TANDUR SaaS Platform. Seluruh hak cipta dilindungi undang-undang.
          </p>
        </div>
      </main>
    </AuthGuard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--canvas)]">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
