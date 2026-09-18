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
        // Protected routes require a valid token.
        // SECURITY (deploy patch 2026-09-18): automatic demo login with hard-coded
        // seed credentials (admin@tani.local/admin123) was removed — it baked a
        // working credential into the public JS bundle.
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

  return <>{children}</>;
}
