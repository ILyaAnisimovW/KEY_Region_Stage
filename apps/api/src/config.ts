export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  webOrigin: string;
  databaseUrl: string;
  port: number;
}
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function loadConfig(env = process.env): AuthConfig {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing configuration: ${name}`);
    return value;
  };
  const production = env.NODE_ENV === 'production';
  const safeUrl = (name: string) => {
    const value = required(name);
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.hash || url.search ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !production))) {
      throw new Error(`Invalid secure URL: ${name}`);
    }
    return value;
  };
  const issuer = safeUrl('OIDC_ISSUER');
  const jwksUrl = safeUrl('OIDC_JWKS_URL');
  // The key endpoint is trusted configuration, never taken from a JWT header.
  if (new URL(issuer).origin !== new URL(jwksUrl).origin) throw new Error('JWKS origin must match issuer');
  const webOrigin = safeUrl('WEB_ORIGIN');
  if (new URL(webOrigin).origin !== webOrigin) throw new Error('WEB_ORIGIN must be an origin without trailing slash');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return { issuer, audience: required('OIDC_AUDIENCE'), jwksUrl, webOrigin, databaseUrl: required('DATABASE_URL'), port };
}
