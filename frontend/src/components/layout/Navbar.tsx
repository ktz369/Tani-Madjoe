"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, Bell, ChevronDown } from "lucide-react";
import { getToken, getUser, logout } from "@/lib/auth";
import { User } from "@/types";
import { api } from "@/lib/api";
import { AlertPanel, getAlertUnreadCount } from "@/components/alerts";

function getUserInitials(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Navbar() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isAlertPanelOpen, setIsAlertPanelOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnread = async () => {
    try {
      const data = await getAlertUnreadCount();
      setUnreadCount(data.total_unread || 0);
    } catch {
      // ignore silently if network/auth not ready
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(e.target as Node)) {
        setIsAdminOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (getToken()) {
      const cached = getUser();
      if (cached) {
        setCurrentUser(cached);
      }
      api.get<User>("/auth/me")
        .then((res) => setCurrentUser(res.data))
        .catch(() => setCurrentUser(null));
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header
        className={`fixed top-[13px] left-1/2 -translate-x-1/2 z-50 h-[44px] max-w-[720px] w-[calc(100%-32px)] rounded-[9999px] bg-white/85 backdrop-blur-[14px] border border-black/[0.08] flex items-center justify-between px-3 transition-shadow duration-200 ${
          isScrolled ? "shadow-[0_4px_24px_rgba(0,0,0,0.14)]" : "shadow-[0_2px_16px_rgba(0,0,0,0.10)]"
        }`}
      >
        {/* Left: Logo */}
        <div className="flex items-center shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-2 py-1 text-[var(--ink)] hover:opacity-80 transition-opacity"
          >
            <Sprout className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="font-semibold text-[13px] tracking-tight">TANDUR</span>
          </Link>
          <div className="w-px h-4 bg-black/10 mx-[5px] shrink-0" />
        </div>

        {/* Center: Nav links */}
        <nav className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className={`px-[11px] py-[4px] rounded-full text-[12px] font-medium transition-colors shrink-0 ${
              pathname === "/dashboard" || pathname.startsWith("/dashboard")
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
            }`}
          >
            Dashboard
          </Link>

          <Link
            href="/peta"
            className={`px-[11px] py-[4px] rounded-full text-[12px] font-medium transition-colors shrink-0 ${
              pathname === "/peta" || pathname.startsWith("/peta")
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
            }`}
          >
            Peta
          </Link>

          <Link
            href="/agronomi"
            className={`px-[11px] py-[4px] rounded-full text-[12px] font-medium transition-colors shrink-0 ${
              pathname === "/agronomi" || pathname.startsWith("/agronomi")
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
            }`}
          >
            Agronomi
          </Link>

          <Link
            href="/laporan"
            className={`px-[11px] py-[4px] rounded-full text-[12px] font-medium transition-colors shrink-0 ${
              pathname === "/laporan" || pathname.startsWith("/laporan")
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
            }`}
          >
            Laporan
          </Link>

          {/* Admin Popover Trigger */}
          <div className="relative shrink-0" ref={adminDropdownRef}>
            <button
              onClick={() => setIsAdminOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1 px-[11px] py-[4px] rounded-full text-[12px] font-medium transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
              }`}
            >
              <span>Admin</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isAdminOpen ? "rotate-180" : ""}`} />
            </button>

            {isAdminOpen && (
              <div className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 w-44 py-1.5 px-1 bg-white/95 backdrop-blur-[14px] border border-black/[0.08] rounded-[6px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-50 flex flex-col gap-0.5">
                <Link
                  href="/admin/petak-baru"
                  onClick={() => setIsAdminOpen(false)}
                  className={`px-3 py-1.5 text-[12px] rounded-[4px] font-medium transition-colors ${
                    pathname === "/admin/petak-baru"
                      ? "text-[var(--accent)] font-semibold bg-emerald-50"
                      : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
                  }`}
                >
                  Petak Baru
                </Link>
                <Link
                  href="/admin/organisasi"
                  onClick={() => setIsAdminOpen(false)}
                  className={`px-3 py-1.5 text-[12px] rounded-[4px] font-medium transition-colors ${
                    pathname.startsWith("/admin/organisasi")
                      ? "text-[var(--accent)] font-semibold bg-emerald-50"
                      : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
                  }`}
                >
                  Organisasi
                </Link>
                <Link
                  href="/admin/varietas"
                  onClick={() => setIsAdminOpen(false)}
                  className={`px-3 py-1.5 text-[12px] rounded-[4px] font-medium transition-colors ${
                    pathname.startsWith("/admin/varietas")
                      ? "text-[var(--accent)] font-semibold bg-emerald-50"
                      : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
                  }`}
                >
                  Varietas
                </Link>
              </div>
            )}
          </div>
        </nav>

        {/* Right: Actions, Bell & User */}
        <div className="flex items-center shrink-0">
          <div className="w-px h-4 bg-black/10 mx-[5px] shrink-0" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAlertPanelOpen(true)}
              className="relative p-1.5 rounded-full text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04] transition-colors focus:outline-none"
              title="Peringatan Lahan"
              aria-label="Peringatan Lahan"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {currentUser ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="size-7 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0 select-none"
                  title={`${currentUser.name} (${currentUser.role})`}
                >
                  {getUserInitials(currentUser.name)}
                </div>
                <button
                  onClick={() => logout()}
                  className="text-[11.5px] text-[var(--ink-3)] hover:text-red-500 transition-colors px-1"
                  title="Keluar dari akun"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-2.5 py-1 rounded-full text-[11.5px] font-medium bg-[var(--accent)] text-white hover:bg-emerald-700 transition-colors"
              >
                Masuk
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Slide-out Drawer Panel Alert */}
      <AlertPanel
        isOpen={isAlertPanelOpen}
        onClose={() => setIsAlertPanelOpen(false)}
        onAlertUpdated={fetchUnread}
      />
    </>
  );
}


