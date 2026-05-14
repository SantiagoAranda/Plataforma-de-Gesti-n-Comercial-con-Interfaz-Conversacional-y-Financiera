export function logoutAndRedirect(redirectTo: (href: string) => void) {
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("session");
    localStorage.removeItem("user");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("businessName");
    localStorage.removeItem("businessSubtitle");
    localStorage.removeItem("businessPhone");

    document.cookie = "token=; Max-Age=0; path=/";
    redirectTo("/login");
  } catch (error) {
    console.error("Error al cerrar sesion", error);
  }
}

