import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const password = () => randomBytes(24).toString('base64url');
const dbPassword = password();
const users = ['buyer', 'other-buyer', 'seller', 'other-seller'].map((name, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  username: name, enabled: true, emailVerified: true,
  firstName: name, lastName: 'Demo', email: `${name}@example.test`,
  credentials: [{ type: 'password', value: password(), temporary: false }],
}));
const realm = {
  realm: 'gourmet-box', enabled: true, sslRequired: 'none',
  registrationAllowed: false, resetPasswordAllowed: false,
  accessTokenLifespan: 300, ssoSessionIdleTimeout: 1800,
  clients: [{
    clientId: 'gourmet-box-web', enabled: true, publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
    redirectUris: ['http://localhost:5173/callback'], webOrigins: ['http://localhost:5173'],
    attributes: { 'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': 'http://localhost:5173' },
    protocolMappers: [{ name: 'api-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
      config: { 'included.custom.audience': 'gourmet-box-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } }],
  }], users,
};
await mkdir(new URL('../infra/keycloak/', import.meta.url), { recursive: true });
// Fail instead of overwriting local secrets or changing existing demo accounts.
await writeFile(new URL('../.env', import.meta.url), [
  'PORT=3000', 'WEB_ORIGIN=http://localhost:5173',
  'OIDC_ISSUER=http://localhost:8080/realms/gourmet-box',
  'OIDC_JWKS_URL=http://localhost:8080/realms/gourmet-box/protocol/openid-connect/certs',
  'OIDC_AUDIENCE=gourmet-box-api', `DATABASE_URL=postgresql://gourmet:${dbPassword}@localhost:5432/gourmet`,
  `POSTGRES_PASSWORD=${dbPassword}`, `KEYCLOAK_ADMIN_PASSWORD=${password()}`, '',
].join('\n'), { flag: 'wx', mode: 0o600 });
await writeFile(new URL('../infra/keycloak/realm.json', import.meta.url), JSON.stringify(realm, null, 2), { flag: 'wx', mode: 0o600 });
console.log('Local .env and Keycloak realm generated. Demo credentials (do not publish):');
for (const user of users) console.log(`${user.username}: ${user.credentials[0].value}`);
