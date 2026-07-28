export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
};

export const removeToken = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
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