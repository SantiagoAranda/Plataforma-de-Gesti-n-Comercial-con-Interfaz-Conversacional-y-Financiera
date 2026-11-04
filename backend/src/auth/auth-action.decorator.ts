import { SetMetadata } from '@nestjs/common';

export const AUTH_ACTION = 'auth:action';
export type AuthActionName = 'login' | 'register' | 'forgot' | 'reset';

/** Stable identity for rate-limit policy; independent of method names. */
export const AuthAction = (action: AuthActionName) =>
  SetMetadata(AUTH_ACTION, action);

export function authActionOf(handler: object): AuthActionName | undefined {
  return Reflect.getMetadata(AUTH_ACTION, handler) as
    | AuthActionName
    | undefined;
}

/** Test helper: a handler carrying the same metadata the decorator sets. */
export function handlerFor(action: AuthActionName): () => void {
  const handler = () => undefined;
  Reflect.defineMetadata(AUTH_ACTION, action, handler);
  return handler;
}
