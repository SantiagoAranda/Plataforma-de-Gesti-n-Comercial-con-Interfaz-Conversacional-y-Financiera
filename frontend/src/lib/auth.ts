export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
};

export const removeToken = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
};