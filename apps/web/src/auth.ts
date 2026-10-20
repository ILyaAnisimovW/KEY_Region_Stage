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
  revokeTokensOnSignout: true,
});
export interface Me { id: string; roles: ('BUYER' | 'STAFF')[]; venues: { id: string; name: string }[] }
export async function getMe(): Promise<Me> {
  let user = await auth.getUser();
  if (!user || user.expired) user = await auth.signinSilent();
  if (!user) throw new Error('Сессия завершена. Войдите снова.');
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1'}/me`, {
    headers: { Authorization: `Bearer ${user.access_token}` }, cache: 'no-store',
  });
  if (response.status === 401) {
    await auth.removeUser();
    throw new Error('Сессия завершена. Войдите снова.');
  }
  if (response.status === 403) {
    await auth.removeUser();
    throw new Error('Учётная запись не подключена к сервису или отключена.');
  }
  if (!response.ok) throw new Error('Не удалось проверить доступ. Попробуйте ещё раз.');
  return response.json();
}
