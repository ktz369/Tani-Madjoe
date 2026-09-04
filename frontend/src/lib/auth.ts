import { api } from "@/lib/api";
import { LoginRequest, LoginResponse, User } from "@/types";

export const TOKEN_KEY = "tani_access_token";
export const USER_KEY = "tani_user";

/**
 * Retrieve the stored JWT token from localStorage.
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Persist the JWT token into localStorage.
 */
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove the stored JWT token from localStorage.
 */
export function removeToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Retrieve cached user profile from localStorage.
 */
export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as User;
  } catch (error) {
    console.error("Gagal mengurai data profil user:", error);
    return null;
  }
}

/**
 * Persist user profile data into localStorage.
 */
export function setUser(user: User): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Remove cached user data from localStorage.
 */
export function removeUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

/**
 * Check whether the user is currently authenticated.
 */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/**
 * Authenticate with email & password, storing token and user info.
 */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", payload);
  const data = response.data;
  
  if (data.access_token) {
    setToken(data.access_token);
  }
  if (data.user) {
    setUser(data.user);
  }
  
  return data;
}

/**
 * Fetch latest user profile from /auth/me endpoint.
 */
export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");
  const user = response.data;
  setUser(user);
  return user;
}

/**
 * Log the user out and clean local state.
 */
export function logout(): void {
  removeToken();
  removeUser();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}
