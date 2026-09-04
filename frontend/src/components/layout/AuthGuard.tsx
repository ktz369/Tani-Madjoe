"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken, getCurrentUser, removeToken, removeUser } from "@/lib/auth";
import { Sprout } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function AuthGuard({
  children,
  requireAuth = true,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function verifyAuth() {
      const token = getToken();

      if (requireAuth) {
        // Protected routes require valid token
        if (!token) {
          if (isMounted) {
            setIsAuthorized(false);
            setIsLoading(false);
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          }
          return;
        }

        try {
          await getCurrentUser();
          if (isMounted) {
            setIsAuthorized(true);
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Sesi tidak valid:", error);
          removeToken();
          removeUser();
          if (isMounted) {
            setIsAuthorized(false);
            setIsLoading(false);
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          }
        }
      } else {
        // Guest only routes (e.g. /login)
        if (token) {
          try {
            await getCurrentUser();
            if (isMounted) {
              setIsAuthorized(false);
              setIsLoading(false);
              router.replace("/");
            }
            return;
          } catch {
            // Token expired or invalid, let guest continue
            removeToken();
            removeUser();
          }
        }

        if (isMounted) {
          setIsAuthorized(true);
          setIsLoading(false);
        }
      }
    }

    verifyAuth();

    return () => {
      isMounted = false;
    };
  }, [requireAuth, router, pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-700">
        <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-lg animate-bounce mb-4">
          <Sprout className="w-8 h-8" />
        </div>
        <div className="flex items-center space-x-2 text-sm font-medium text-slate-600">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-600 border-t-transparent"></div>
          <span>Memeriksa sesi pengguna...</span>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
