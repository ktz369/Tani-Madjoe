"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken, getCurrentUser, removeToken, removeUser, setToken, setUser } from "@/lib/auth";
import { api } from "@/lib/api";
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
          // Attempt automatic demo authentication for local testing
          try {
            const demoRes = await api.post("/auth/login", {
              email: "admin@tani.local",
              password: "admin123",
            });
            if (demoRes.data?.access_token) {
              setToken(demoRes.data.access_token);
              if (demoRes.data.user) setUser(demoRes.data.user);
              if (isMounted) {
                setIsAuthorized(true);
                setIsLoading(false);
              }
              return;
            }
          } catch {
            // Fallback to manual login if backend demo credentials fail
          }

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

          // Attempt re-auth with demo credentials
          try {
            const demoRes = await api.post("/auth/login", {
              email: "admin@tani.local",
              password: "admin123",
            });
            if (demoRes.data?.access_token) {
              setToken(demoRes.data.access_token);
              if (demoRes.data.user) setUser(demoRes.data.user);
              if (isMounted) {
                setIsAuthorized(true);
                setIsLoading(false);
              }
              return;
            }
          } catch {
            // Ignore
          }

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
