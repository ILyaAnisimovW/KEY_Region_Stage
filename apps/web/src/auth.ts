import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';
export const auth = new UserManager({
  authority: import.meta.env.VITE_OIDC_ISSUER ?? 'http://localhost:8080/realms/gourmet-box',
  client_id: 'gourmet-box-web',
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code', scope: 'openid profile',
  // No access or refresh token is persisted in localStorage/sessionStorage.
  userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  // Only transient state + PKCE verifier survive the redirect.
  stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true, monitorSession: false,
  ui_locales: 'ru', requestTimeoutInSeconds: 8,
  revokeTokensOnSignout: true,
});
export interface Me { id: string; roles: ('BUYER' | 'STAFF')[]; venues: { id: string; name: string }[] }
// A non-sensitive hint only. Tokens and profile data are never persisted here.
export const SESSION_HINT = 'gourmet.session-hint';
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1';
export function signIn(register = false) {
  return auth.signinRedirect({ ...(register ? { prompt: 'create' } : {}), state: { intent: register ? 'register' : 'login' } });
}
export async function getMe(): Promise<Me> {
  let user = await auth.getUser();
  if (!user || user.expired) user = await auth.signinSilent();
  if (!user) throw new Error('Сессия завершена. Войдите снова.');
  let response = await fetch(`${apiUrl}/me`, {
    headers: { Authorization: `Bearer ${user.access_token}` }, cache: 'no-store', signal: AbortSignal.timeout(75000),
  });
  if (response.status === 401) {
    await auth.removeUser();
    throw new Error('Сессия завершена. Войдите снова.');
  }
  if (response.status === 403) {
    response = await fetch(`${apiUrl}/me/registration`, {
      method: 'POST', headers: { Authorization: `Bearer ${user.access_token}`, 'Idempotency-Key': crypto.randomUUID() },
      cache: 'no-store', signal: AbortSignal.timeout(75000),
    });
    if (response.status === 403) {
      await auth.removeUser();
      throw new Error('Доступ к аккаунту ограничен. Обратитесь к администратору сервиса.');
    }
  }
  if (!response.ok) throw new Error('Не удалось проверить доступ. Попробуйте ещё раз.');
  return response.json();
}
