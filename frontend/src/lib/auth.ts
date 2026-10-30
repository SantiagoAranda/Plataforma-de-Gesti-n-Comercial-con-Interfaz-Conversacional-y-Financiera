import { clearSession, getSessionContext } from './auth/session';

export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return getSessionContext().token;
};

export const removeToken = () => {
  if (typeof window === "undefined") return;
  clearSession();
};

export const handleSessionExpired = () => {
  removeToken();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("session_expired_notice", "true");
    } catch {}
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?expired=true";
    }
  }
};
