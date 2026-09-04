"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, LogIn, LogOut, User as UserIcon, Building2, LayoutDashboard, Shield, Map, PlusCircle, Home, Bell, FileText } from "lucide-react";
import { getToken, getUser, logout } from "@/lib/auth";
import { User } from "@/types";
import { api } from "@/lib/api";
import { AlertPanel, getAlertUnreadCount } from "@/components/alerts";

export default function Navbar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isAlertPanelOpen, setIsAlertPanelOpen] = useState<boolean>(false);

  const fetchUnread = async () => {
    if (!getToken()) return;
    try {
      const data = await getAlertUnreadCount();
      setUnreadCount(data.total_unread || 0);
    } catch {
      // ignore silently if network/auth not ready
    }
  };

  useEffect(() => {
    if (getToken()) {
      const cached = getUser();
      if (cached) {
        setCurrentUser(cached);
      }
      api.get<User>("/auth/me")
        .then((res) => setCurrentUser(res.data))
        .catch(() => setCurrentUser(null));

      fetchUnread();
      // Polling unread count setiap 60 detik
      const interval = setInterval(fetchUnread, 60000);
      return () => clearInterval(interval);
    }
  }, []);

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand & Navigation Links */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-600 rounded-lg text-white shadow-sm">
              <Sprout className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">Tani</span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                SaaS Pertanian
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center space-x-1 pl-4 border-l border-slate-200">
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-slate-100 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Beranda</span>
            </Link>

            <Link
              href="/dashboard"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/dashboard" || pathname.startsWith("/dashboard")
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-600" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/peta"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/peta" || pathname.startsWith("/peta")
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Map className="w-4 h-4 text-emerald-600" />
              <span>Peta Lahan</span>
            </Link>

            <Link
              href="/admin/petak-baru"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/admin/petak-baru"
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span>Petak Baru</span>
            </Link>

            <Link
              href="/admin/organisasi"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/admin/organisasi")
                  ? "bg-slate-100 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Hierarki Organisasi</span>
            </Link>

            <Link
              href="/admin/varietas"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/admin/varietas")
                  ? "bg-slate-100 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Sprout className="w-4 h-4" />
              <span>Varietas & Fenologi</span>
            </Link>

            <Link
              href="/laporan"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/laporan" || pathname.startsWith("/laporan")
                  ? "bg-emerald-50 text-emerald-700 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Laporan</span>
            </Link>
          </nav>
        </div>

        {/* Right: User Status, Alerts & Actions */}
        <div className="flex items-center space-x-3">
          {/* Notification Bell Icon */}
          <button
            onClick={() => setIsAlertPanelOpen(true)}
            className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            title="Lihat Peringatan & Anomali Lahan"
            aria-label="Peringatan Lahan"
          >
            <Bell className="w-5 h-5 text-slate-700" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-extrabold text-white bg-rose-600 ring-2 ring-white shadow-sm animate-pulse">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {currentUser ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-700">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-semibold text-slate-900">{currentUser.name}</span>
                <span className="text-slate-400">|</span>
                <span className="capitalize text-emerald-700 font-medium">{currentUser.role}</span>
              </div>
              <button
                onClick={() => logout()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                title="Keluar dari akun"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk</span>
            </Link>
          )}
        </div>
      </div>

      {/* Slide-out Drawer Panel Alert */}
      <AlertPanel
        isOpen={isAlertPanelOpen}
        onClose={() => setIsAlertPanelOpen(false)}
        onAlertUpdated={fetchUnread}
      />
    </header>
  );
}

