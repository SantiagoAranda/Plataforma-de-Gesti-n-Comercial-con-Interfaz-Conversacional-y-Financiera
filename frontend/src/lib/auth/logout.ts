import { clearSession } from './session';
export function logoutAndRedirect(redirectTo: (href: string) => void) {
  try {
    clearSession();

    document.cookie = "token=; Max-Age=0; path=/";
    redirectTo("/login");
  } catch (error) {
    console.error("Error al cerrar sesion", error);
  }
}

