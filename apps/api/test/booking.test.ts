import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { BookingController } from '../src/modules/booking/booking.controller.js';
import type { AuthRequest } from '../src/modules/access/access.guard.js';
import type { AuthConfig } from '../src/config.js';

const buyer = randomUUID(), staff = randomUUID(), venue = randomUUID();
const request = (id: string, role: 'BUYER' | 'STAFF', key = randomUUID()) => ({ principal: { id, roles: [role] }, headers: { 'idempotency-key': key } }) as unknown as AuthRequest;

test('published offer can be reserved, retried, listed, cancelled and fulfilled', async () => {
  const db = new PGlite();
  try {
    for (const name of ['001-access.sql', '002-booking.sql', '003-offer-safety.sql']) await db.exec(await readFile(new URL(`../../../../db/migrations/${name}`, import.meta.url), 'utf8'));
    for (const [id, role] of [[buyer, 'BUYER'], [staff, 'STAFF']]) await db.query('INSERT INTO app_users(id,issuer,subject,roles) VALUES($1,$2,$3,$4)', [id, 'https://issuer.example', id, [role]]);
    await db.query('INSERT INTO venues(id,name,address,timezone) VALUES($1,$2,$3,$4)', [venue, 'Пекарня', 'Улица 1', 'Europe/Samara']);
    const client = { query: (...args: Parameters<typeof db.query>) => db.query(...args), release() {} };
    const pool = { query: client.query, connect: async () => client } as unknown as Pool;
    const config = { databaseUrl: 'test', pickupCodeKey: 'test-key-with-32-character-minimum-123' } as AuthConfig;
    const controller = new BookingController(pool, config);
    const start = new Date(Date.now() + 60 * 60_000).toISOString(), end = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
    const published = await controller.createOffer(venue, { title: 'Вечерняя выпечка', items: [{ name: 'Круассан', quantity: 3, allergens: 'Глютен, молоко' }], totalBoxes: 2, priceMinor: 20000, originalPriceMinor: 50000, pickupWindowStart: start, pickupWindowEnd: end, expiresAt: new Date(Date.now() + 5 * 60 * 60_000).toISOString(), storageConfirmed: true });
    assert.equal(published.availableBoxes, 2);
    assert.equal((await controller.listOffers()).items.length, 1);
    const pickupAt = new Date(Date.now() + 90 * 60_000).toISOString();
    const buyerReq = request(buyer, 'BUYER');
    const first = await controller.createOrder(buyerReq, { offerId: published.id, quantity: 1, pickupAt, paymentMethod: 'AT_PICKUP' });
    assert.equal(first.status, 'RESERVED');
    assert.match(first.pickupCode!, /^\d{6}$/);
    assert.equal((await controller.createOrder(buyerReq, { offerId: published.id, quantity: 1, pickupAt, paymentMethod: 'AT_PICKUP' })).id, first.id);
    assert.equal((await controller.getOffer(published.id)).availableBoxes, 1);
    const staffReq = request(staff, 'STAFF');
    assert.equal((await controller.listVenueOrders(venue)).items[0]?.pickupCode, undefined);
    await assert.rejects(controller.createOrder(request(buyer, 'BUYER'), { offerId: published.id, quantity: 2, pickupAt, paymentMethod: 'AT_PICKUP' }), /Столько боксов/);
    await db.query("UPDATE order_details SET pickup_window_start=now()-interval '1 minute' WHERE order_id=$1", [first.id]);
    await assert.rejects(controller.fulfill(first.id, staffReq, { pickupCode: '999999' }), /Неверный код/);
    assert.equal((await controller.getOrder(first.id, buyerReq)).status, 'RESERVED');
    const cancelled = await controller.cancel(first.id, buyerReq, { reason: 'Передумал' });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal((await controller.getOffer(published.id)).availableBoxes, 2);
    assert.equal((await controller.cancel(first.id, buyerReq, { reason: 'Ещё раз' })).status, 'CANCELLED');
    const second = await controller.createOrder(request(buyer, 'BUYER'), { offerId: published.id, quantity: 1, pickupAt, paymentMethod: 'ONLINE_LATER' });
    assert.equal((await controller.listMyOrders(buyerReq)).items.length, 2);
    // Fulfilment is constrained to the configured pickup window, so a future booking cannot be handed out now.
    await assert.rejects(controller.fulfill(second.id, staffReq, { pickupCode: second.pickupCode }), /только в окне/);
    await db.query("UPDATE order_details SET pickup_window_start=now()-interval '1 minute' WHERE order_id=$1", [second.id]);
    assert.equal((await controller.fulfill(second.id, staffReq, { pickupCode: second.pickupCode })).status, 'FULFILLED');
    assert.equal((await controller.getOffer(published.id)).availableBoxes, 1);
  } finally { await db.close(); }
});
