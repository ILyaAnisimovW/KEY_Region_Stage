import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Controller, Get, Module, Req, type INestApplication } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { PGlite } from '@electric-sql/pglite';
import { parse } from 'yaml';
import { AUTH_CONFIG, type AuthConfig, loadConfig } from '../src/config.js';
import { ACCESS_REPOSITORY } from '../src/modules/access/types.js';
import { PgAccessRepository } from '../src/modules/access/repository.js';
import { AccessGuard, type AuthRequest } from '../src/modules/access/access.guard.js';
import { TokenVerifier } from '../src/modules/access/token-verifier.js';
import { OperationAccess, policies } from '../src/modules/access/policies.js';
import { MeController } from '../src/modules/access/me.controller.js';
import { configureHttp } from '../src/http.js';

// Test-only controllers exercise the production guard. They are never imported by AppModule.
@Controller('probe')
class ProbeController {
  @Get('public') @OperationAccess('listOffers') public() { return { ok: true }; }
  @Get('buyer') @OperationAccess('createOrder') buyer(@Req() req: AuthRequest) { return { buyerId: req.principal!.id }; }
  @Get('venues/:venueId') @OperationAccess('listBatches') venue() { return { ok: true }; }
  @Get('venues/:venueId/offers/:offerId') @OperationAccess('publishOffer') offer() { return { ok: true }; }
  @Get('orders/:orderId') @OperationAccess('getOrder') order() { return { ok: true }; }
  @Get('orders/:orderId/cancel') @OperationAccess('cancelOrder') cancel() { return { ok: true }; }
  @Get('orders/:orderId/fulfill') @OperationAccess('fulfillOrder') fulfill() { return { ok: true }; }
  @Get('orders/:orderId/no-show') @OperationAccess('markNoShow') noShow() { return { ok: true }; }
  @Get('orders/:orderId/events') @OperationAccess('listOrderEvents') events() { return { ok: true }; }
  @Get('unmarked') unmarked() { return { ok: true }; }
}
const buyer = '10000000-0000-4000-8000-000000000001';
const otherBuyer = '10000000-0000-4000-8000-000000000002';
const seller = '10000000-0000-4000-8000-000000000003';
const otherSeller = '10000000-0000-4000-8000-000000000004';
const venue = '20000000-0000-4000-8000-000000000001';
const otherVenue = '20000000-0000-4000-8000-000000000002';
const order = '30000000-0000-4000-8000-000000000001';
const offer = '40000000-0000-4000-8000-000000000001';
let app: INestApplication;
let db: PGlite;
let jwks: Server;
let base: string;
let config: AuthConfig;
let key: Awaited<ReturnType<typeof generateKeyPair>>;
const tokens: Record<string, string> = {};
async function sign(sub: string, claims: Record<string, unknown> = {}, signingKey = key.privateKey) {
  return new SignJWT({ typ: 'Bearer', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(config.issuer).setAudience(config.audience).setSubject(sub)
    .setIssuedAt().setExpirationTime('5m').sign(signingKey);
}
async function request(path: string, token?: string) {
  return fetch(`${base}/v1/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
before(async () => {
  key = await generateKeyPair('RS256');
  const publicKey = { ...await exportJWK(key.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  jwks = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ keys: [publicKey] })); });
  await new Promise<void>(resolve => jwks.listen(0, '127.0.0.1', resolve));
  const addr = jwks.address() as { port: number };
  const issuer = `http://127.0.0.1:${addr.port}/realm`;
  config = { issuer, audience: 'gourmet-box-api', jwksUrl: `${issuer}/certs`, webOrigin: 'http://localhost:5173', databaseUrl: 'unused', port: 3000 };
  db = new PGlite();
  await db.exec(await readFile(new URL('../../../../db/migrations/001-access.sql', import.meta.url), 'utf8'));
  for (const [id, role] of [[buyer, 'BUYER'], [otherBuyer, 'BUYER'], [seller, 'STAFF'], [otherSeller, 'STAFF']]) {
    await db.query('INSERT INTO app_users(id,issuer,subject,roles) VALUES($1,$2,$3,$4)', [id, issuer, id, [role]]);
    tokens[id!] = await sign(id!);
  }
  for (const id of [venue, otherVenue]) await db.query('INSERT INTO venues VALUES($1,$2,$3,$4)', [id, 'Demo', 'Address', 'Europe/Samara']);
  await db.query('INSERT INTO memberships VALUES($1,$2),($3,$4)', [seller, venue, otherSeller, otherVenue]);
  await db.query('INSERT INTO orders VALUES($1,$2,$3)', [order, buyer, venue]);
  await db.query('INSERT INTO offers VALUES($1,$2)', [offer, venue]);
  const repository = new PgAccessRepository({ query: async (sql, values) => db.query(sql, values) });
  @Module({ controllers: [ProbeController, MeController], providers: [
    { provide: AUTH_CONFIG, useValue: config }, { provide: ACCESS_REPOSITORY, useValue: repository },
    TokenVerifier, { provide: APP_GUARD, useClass: AccessGuard }
  ] }) class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  configureHttp(app, config, 1000);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => { await app?.close(); await db?.close(); await new Promise<void>(resolve => jwks?.close(() => resolve())); });

test('public route needs no token; /me returns 401 and a safe Error', async () => {
  assert.equal((await request('probe/public')).status, 200);
  const res = await request('me');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), 'Bearer');
  const body = await res.json();
  assert.equal(body.code, 'UNAUTHENTICATED'); assert.ok(body.requestId); assert.equal(body.stack, undefined);
});
test('valid signed token maps issuer/sub to local user and own memberships', async () => {
  const res = await request('me', tokens[seller]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { id: seller, roles: ['STAFF'], venues: [{ id: venue, name: 'Demo' }] });
});
test('rejects unsigned, forged, expired, wrong issuer/audience, future nbf, missing exp and ID tokens', async () => {
  const invalid = [
    'eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZW1vIn0.',
    await sign(buyer, {}, (await generateKeyPair('RS256')).privateKey),
    await new SignJWT({ typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(config.issuer).setAudience(config.audience).setSubject(buyer).setIssuedAt().setExpirationTime(1).sign(key.privateKey),
    await new SignJWT({ typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://attacker.test').setAudience(config.audience).setSubject(buyer).setIssuedAt().setExpirationTime('5m').sign(key.privateKey),
    await new SignJWT({ typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(config.issuer).setAudience('another-api').setSubject(buyer).setIssuedAt().setExpirationTime('5m').sign(key.privateKey),
    await sign(buyer, { nbf: Math.floor(Date.now() / 1000) + 3600 }),
    await new SignJWT({ typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(config.issuer).setAudience(config.audience).setSubject(buyer).setIssuedAt().sign(key.privateKey),
    await sign(buyer, { typ: 'ID' }),
  ];
  for (const token of invalid) assert.equal((await request('me', token)).status, 401);
});
test('unprovisioned identity cannot get access', async () => {
  assert.equal((await request('me', await sign('not-provisioned'))).status, 403);
});

async function register(token?: string, body?: unknown, key: string | null = randomUUID()) {
  return fetch(`${base}/v1/me/registration`, { method: 'POST', headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(key ? { 'Idempotency-Key': key } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test('self-registration requires a valid identity and a UUID idempotency key', async () => {
  assert.equal((await register()).status, 401);
  assert.equal((await register('invalid.jwt.signature')).status, 401);
  const token = await sign('signup-validation');
  assert.equal((await register(token, undefined, null)).status, 400);
  assert.equal((await register(token, undefined, 'invalid')).status, 400);
  assert.equal((await register(token, { roles:['STAFF'], password:'must-not-be-stored' })).status, 400);
  assert.equal((await db.query('SELECT id FROM app_users WHERE subject=$1', ['signup-validation'])).rows.length, 0);
});

test('new identities explicitly register as BUYER and retries create only one account', async () => {
  const subject = 'self-registered-buyer';
  const token = await sign(subject, { roles:['STAFF'], realm_access:{roles:['STAFF']} });
  assert.equal((await request('me', token)).status, 403);
  const responses = await Promise.all([register(token), register(token), register(token)]);
  assert.ok(responses.every(r => r.status === 200));
  const users = await Promise.all(responses.map(r => r.json()));
  assert.ok(users.every(u => u.id === users[0].id));
  assert.deepEqual(users[0].roles, ['BUYER']); assert.deepEqual(users[0].venues, []);
  assert.equal((await request('me', token)).status, 200);
  assert.equal((await request(`probe/venues/${venue}`, token)).status, 403);
  assert.equal((await db.query('SELECT id FROM app_users WHERE issuer=$1 AND subject=$2', [config.issuer,subject])).rows.length, 1);
});

test('registration preserves existing staff roles and assigned venues', async () => {
  const response = await register(tokens[seller]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id:seller, roles:['STAFF'], venues:[{id:venue,name:'Demo'}] });
});

test('registration cannot reactivate a disabled account', async () => {
  await db.query('UPDATE app_users SET active=false WHERE id=$1', [otherBuyer]);
  try {
    assert.equal((await register(tokens[otherBuyer])).status, 403);
    const { rows } = await db.query<{active:boolean;roles:string[]}>('SELECT active,roles FROM app_users WHERE id=$1', [otherBuyer]);
    assert.equal(rows[0]?.active, false); assert.deepEqual(rows[0]?.roles, ['BUYER']);
  } finally { await db.query('UPDATE app_users SET active=true WHERE id=$1', [otherBuyer]); }
});
test('BUYER alone can create/list personal orders; supplied buyerId never changes principal', async () => {
  const res = await request(`probe/buyer?buyerId=${otherBuyer}`, tokens[buyer]);
  assert.deepEqual(await res.json(), { buyerId: buyer });
  assert.equal((await request('probe/buyer', tokens[seller])).status, 403);
});
test('staff membership is mandatory; arbitrary venueId is not a permission', async () => {
  assert.equal((await request(`probe/venues/${venue}`, tokens[seller])).status, 200);
  assert.equal((await request(`probe/venues/${venue}`, tokens[otherSeller])).status, 404);
  assert.equal((await request(`probe/venues/${venue}`, tokens[buyer])).status, 403);
  assert.equal((await request('probe/venues/not-a-uuid', tokens[seller])).status, 404);
});
test('offerId cannot escape the venue scope even when staff has membership', async () => {
  assert.equal((await request(`probe/venues/${venue}/offers/${offer}`, tokens[seller])).status, 200);
  assert.equal((await request(`probe/venues/${otherVenue}/offers/${offer}`, tokens[otherSeller])).status, 404);
});
test('order and history are visible only to owner or assigned staff', async () => {
  for (const suffix of ['', '/events', '/cancel']) {
    assert.equal((await request(`probe/orders/${order}${suffix}`, tokens[buyer])).status, 200);
    assert.equal((await request(`probe/orders/${order}${suffix}`, tokens[seller])).status, 200);
    assert.equal((await request(`probe/orders/${order}${suffix}`, tokens[otherBuyer])).status, 404);
    assert.equal((await request(`probe/orders/${order}${suffix}`, tokens[otherSeller])).status, 404);
  }
});
test('only assigned staff may fulfill or mark no-show', async () => {
  for (const suffix of ['fulfill', 'no-show']) {
    assert.equal((await request(`probe/orders/${order}/${suffix}`, tokens[seller])).status, 200);
    assert.equal((await request(`probe/orders/${order}/${suffix}`, tokens[buyer])).status, 404);
    assert.equal((await request(`probe/orders/${order}/${suffix}`, tokens[otherSeller])).status, 404);
  }
});
test('forged role claims do not grant database permissions', async () => {
  const token = await sign(buyer, { roles: ['STAFF'], realm_access: { roles: ['STAFF'] } });
  assert.equal((await request(`probe/venues/${venue}`, token)).status, 403);
});
test('membership removal and disabled user take effect even with an unexpired JWT', async () => {
  await db.query('DELETE FROM memberships WHERE user_id=$1', [seller]);
  assert.equal((await request(`probe/venues/${venue}`, tokens[seller])).status, 404);
  await db.query('INSERT INTO memberships VALUES($1,$2)', [seller, venue]);
  await db.query('UPDATE app_users SET active=false WHERE id=$1', [otherBuyer]);
  assert.equal((await request('me', tokens[otherBuyer])).status, 403);
  await db.query('UPDATE app_users SET active=true WHERE id=$1', [otherBuyer]);
});
test('unmarked endpoints are denied and every OpenAPI operation has a policy', async () => {
  assert.equal((await request('probe/unmarked', tokens[buyer])).status, 403);
  const spec = parse(await readFile(new URL('../../../../gourmet-box-docs/openapi.yaml', import.meta.url), 'utf8'));
  for (const path of Object.values(spec.paths) as Record<string, { operationId?: string; security?: unknown[] }>[]) {
    for (const method of ['get', 'post', 'patch']) {
      const operation = path[method]; if (!operation) continue;
      assert.ok(operation.operationId! in policies, `Missing policy for ${operation.operationId}`);
      if (operation.security?.length === 0) assert.equal(policies[operation.operationId as keyof typeof policies], 'public');
    }
  }
});
test('production config rejects HTTP issuer and untrusted JWKS origin', () => {
  const env = { NODE_ENV: 'production', OIDC_ISSUER: 'http://localhost:8080/realm', OIDC_JWKS_URL: 'http://localhost:8080/realm/certs', WEB_ORIGIN: 'https://app.example', OIDC_AUDIENCE: 'api', DATABASE_URL: 'postgresql://unused' };
  assert.throws(() => loadConfig(env), /secure URL/);
  assert.throws(() => loadConfig({ ...env, OIDC_ISSUER: 'https://id.example/realm', OIDC_JWKS_URL: 'https://evil.example/certs' }), /origin/);
});
test('rate limit returns the contract Error without logging credentials', async () => {
  @Module({ controllers: [MeController], providers: [
    { provide: ACCESS_REPOSITORY, useValue: {} },
    { provide: AUTH_CONFIG, useValue: config }, TokenVerifier,
    { provide: APP_GUARD, useClass: AccessGuard },
  ] }) class LimitedModule {}
  const limited = await NestFactory.create(LimitedModule, { logger: false });
  configureHttp(limited, config, 1);
  await limited.listen(0, '127.0.0.1');
  try {
    const url = `${await limited.getUrl()}/v1/health`;
    assert.equal((await fetch(url)).status, 200);
    const response = await fetch(url);
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.code, 'RATE_LIMITED'); assert.ok(body.requestId);
  } finally { await limited.close(); }
});
