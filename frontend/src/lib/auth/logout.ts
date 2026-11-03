import { pushLogoutCleanup } from '../push/lifecycle';
import { clearSession, getSessionContext } from './session';

let loggingOut = false;

export async function logoutAndRedirect(redirectTo: (href: string) => void) {
  if (loggingOut) return;
  loggingOut = true;
  try {
    // Baja de push con el token vigente, acotada en tiempo; el logout nunca depende de la red.
    await pushLogoutCleanup(getSessionContext());
    clearSession();

    document.cookie = "token=; Max-Age=0; path=/";
    redirectTo("/login");
  } catch (error) {
    console.error("Error al cerrar sesion", error);
  } finally {
    loggingOut = false;
  }
}
