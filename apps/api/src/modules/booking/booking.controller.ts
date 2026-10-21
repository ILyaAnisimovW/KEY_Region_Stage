import { BadRequestException, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Body, Req } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AUTH_CONFIG, type AuthConfig } from '../../config.js';
import { OperationAccess } from '../access/policies.js';
import type { AuthRequest } from '../access/access.guard.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINUTE = 60_000;
type Item = { name: string; quantity: number; allergens: string };
type OfferInput = { title: string; items: Item[]; totalBoxes: number; priceMinor: number; originalPriceMinor: number; pickupWindowStart: string; pickupWindowEnd: string; expiresAt: string; storageConfirmed: true };
type OrderInput = { offerId: string; quantity: number; pickupAt: string; paymentMethod: 'AT_PICKUP' | 'ONLINE_LATER' };
type Row = Record<string, any>;

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('JSON object required');
  return input as Record<string, unknown>;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)) throw new BadRequestException('Valid date-time required');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new BadRequestException('Valid date-time required');
  return time;
}
function integer(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new BadRequestException(`Integer ${min}–${max} required`);
  return Number(value);
}
function validOffer(body: unknown): OfferInput {
  const b = object(body);
  if (typeof b.title !== 'string' || b.title.trim().length < 3 || b.title.length > 100) throw new BadRequestException('Title must contain 3–100 characters');
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 12) throw new BadRequestException('At least one item required');
  const items = b.items.map(raw => {
    const item = object(raw);
    if (typeof item.name !== 'string' || item.name.trim().length < 2 || item.name.length > 100) throw new BadRequestException('Invalid item name');
    if (typeof item.allergens !== 'string' || !item.allergens.trim() || item.allergens.length > 300) throw new BadRequestException('Allergen information required');
    return { name: item.name.trim(), quantity: integer(item.quantity, 1, 100), allergens: item.allergens.trim() };
  });
  const totalBoxes = integer(b.totalBoxes, 1, 1000);
  const priceMinor = integer(b.priceMinor, 100, 10_000_000);
  const originalPriceMinor = integer(b.originalPriceMinor, priceMinor + 1, 10_000_000);
  const start = timestamp(b.pickupWindowStart), end = timestamp(b.pickupWindowEnd);
  if (start < Date.now() || end - start < 30 * MINUTE || end > Date.now() + 24 * 60 * MINUTE) throw new BadRequestException('Pickup window must start in the future, last at least 30 minutes and end within 24 hours');
  const expiresAt = timestamp(b.expiresAt);
  if (b.storageConfirmed !== true) throw new BadRequestException('Storage conditions must be confirmed');
  if (end > expiresAt - 30 * MINUTE) throw new BadRequestException('Pickup must end at least 30 minutes before the food expires');
  return { title: b.title.trim(), items, totalBoxes, priceMinor, originalPriceMinor, pickupWindowStart: new Date(start).toISOString(), pickupWindowEnd: new Date(end).toISOString(), expiresAt: new Date(expiresAt).toISOString(), storageConfirmed: true };
}
function validOrder(body: unknown): OrderInput {
  const b = object(body);
  if (typeof b.offerId !== 'string' || !uuid.test(b.offerId)) throw new BadRequestException('Valid offerId required');
  const quantity = integer(b.quantity, 1, 5);
  const pickupAt = new Date(timestamp(b.pickupAt)).toISOString();
  if (b.paymentMethod !== 'AT_PICKUP' && b.paymentMethod !== 'ONLINE_LATER') throw new BadRequestException('Valid paymentMethod required');
  return { offerId: b.offerId, quantity, pickupAt, paymentMethod: b.paymentMethod };
}
function key(req: AuthRequest) {
  const value = req.headers['idempotency-key'];
  if (typeof value !== 'string' || !uuid.test(value)) throw new BadRequestException('Idempotency-Key UUID required');
  return value;
}
function offer(row: Row) {
  return { id: row.id, venueId: row.venue_id, venueName: row.venue_name, address: row.address,
    title: row.title, status: row.status, items: row.items, totalBoxes: row.total_boxes,
    reservedBoxes: row.reserved_boxes, fulfilledBoxes: row.fulfilled_boxes,
    availableBoxes: row.status === 'PUBLISHED' ? row.total_boxes - row.reserved_boxes - row.fulfilled_boxes : 0,
    priceMinor: row.price_minor, originalPriceMinor: row.original_price_minor, currency: 'RUB',
    pickupWindowStart: row.pickup_window_start, pickupWindowEnd: row.pickup_window_end, expiresAt: row.expires_at, createdAt: row.created_at };
}

@Controller()
export class BookingController {
  private readonly cryptoKey: Buffer;
  constructor(@Inject('DATABASE_POOL') private readonly db: Pool, @Inject(AUTH_CONFIG) config: AuthConfig) {
    this.cryptoKey = createHash('sha256').update(config.pickupCodeKey ?? config.databaseUrl).digest();
  }
  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private codeHash(orderId: string, code: string) { return createHmac('sha256', this.cryptoKey).update(`${orderId}:${code}`).digest('hex'); }
  private encrypt(code: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.cryptoKey, iv);
    const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  private decrypt(value: string) {
    const raw = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.cryptoKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
  private order(row: Row, buyerId?: string) {
    return { id: row.id, venueId: row.venue_id, venueName: row.venue_name, address: row.address,
      offerId: row.offer_id, title: row.title, status: row.status, quantity: row.quantity,
      unitPriceMinor: row.unit_price_minor, totalPriceMinor: row.unit_price_minor * row.quantity,
      originalTotalMinor: row.original_unit_minor * row.quantity, currency: 'RUB', items: row.items,
      pickupAt: row.pickup_at, pickupWindowStart: row.pickup_window_start, pickupWindowEnd: row.pickup_window_end,
      noShowEligibleAt: new Date(Math.min(new Date(row.pickup_at).getTime() + 15 * MINUTE, new Date(row.pickup_window_end).getTime())).toISOString(),
      paymentMethod: row.payment_method, paymentStatus: 'NOT_PROCESSED', createdAt: row.created_at,
      updatedAt: row.updated_at, completedAt: row.completed_at,
      ...(buyerId === row.buyer_id && row.status === 'RESERVED' ? { pickupCode: this.decrypt(row.pickup_code_cipher) } : {}) };
  }
  private readonly offerSelect = 'SELECT o.id,o.venue_id,v.name AS venue_name,v.address,d.* FROM offers o JOIN offer_details d ON d.offer_id=o.id JOIN venues v ON v.id=o.venue_id';
  private readonly orderSelect = 'SELECT o.id,o.buyer_id,o.venue_id,v.name AS venue_name,v.address,d.* FROM orders o JOIN order_details d ON d.order_id=o.id JOIN venues v ON v.id=o.venue_id';

  private async ensureDemoOffer() {
    if (process.env.DEMO_CATALOG !== '1') return;
    const venueId = '20000000-0000-4000-8000-000000000099';
    await this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('gourmet-box-demo-catalog'))");
      await client.query(`INSERT INTO venues(id,name,address,timezone)
        VALUES($1,'Gourmet Box · демо','Тестовый заказ — реальной выдачи нет','Europe/Samara')
        ON CONFLICT (id) DO NOTHING`, [venueId]);
      const last = await client.query(`SELECT d.pickup_window_end FROM offers o
        JOIN offer_details d ON d.offer_id=o.id WHERE o.venue_id=$1
        ORDER BY d.created_at DESC LIMIT 1`, [venueId]);
      if (last.rows[0] && new Date(last.rows[0].pickup_window_end).getTime() > Date.now() + 15 * MINUTE) return;
      const id = randomUUID();
      const start = new Date(Date.now() + 30 * MINUTE);
      const end = new Date(Date.now() + 150 * MINUTE);
      await client.query('INSERT INTO offers(id,venue_id) VALUES($1,$2)', [id, venueId]);
      await client.query(`INSERT INTO offer_details(offer_id,title,items,total_boxes,price_minor,original_price_minor,pickup_window_start,pickup_window_end,expires_at,storage_confirmed)
        VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,true)`, [id, 'Тестовый бокс с выпечкой · без выдачи', JSON.stringify([
          { name: 'Круассан сливочный', quantity: 3, allergens: 'Глютен, молоко, яйца' },
          { name: 'Булочка с корицей', quantity: 2, allergens: 'Глютен, молоко' },
        ]), 8, 20000, 50000, start, end, new Date(end.getTime() + 90 * MINUTE)]);
    });
  }

  @Get('offers') @OperationAccess('listOffers')
  async listOffers() {
    await this.ensureDemoOffer();
    const { rows } = await this.db.query(`${this.offerSelect} WHERE d.status='PUBLISHED' AND d.total_boxes>d.reserved_boxes+d.fulfilled_boxes AND d.pickup_window_end>=now()+interval '15 minutes' ORDER BY d.pickup_window_end ASC LIMIT 50`);
    return { items: rows.map(offer), nextCursor: null };
  }
  @Get('offers/:offerId') @OperationAccess('getOffer')
  async getOffer(@Param('offerId') id: string) {
    if (!uuid.test(id)) throw new NotFoundException();
    const { rows } = await this.db.query(`${this.offerSelect} WHERE o.id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException();
    return offer(rows[0]);
  }
  @Get('venues/:venueId') @OperationAccess('getVenue')
  async getVenue(@Param('venueId') id: string) {
    if (!uuid.test(id)) throw new NotFoundException();
    const { rows } = await this.db.query('SELECT id,name,address,timezone FROM venues WHERE id=$1', [id]);
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
  @Get('venues/:venueId/offers') @OperationAccess('listVenueOffers')
  async listVenueOffers(@Param('venueId') id: string) {
    const { rows } = await this.db.query(`${this.offerSelect} WHERE o.venue_id=$1 ORDER BY d.created_at DESC LIMIT 50`, [id]);
    return { items: rows.map(offer), nextCursor: null };
  }
  @Post('venues/:venueId/offers') @OperationAccess('createOffer')
  async createOffer(@Param('venueId') venueId: string, @Body() body: unknown) {
    const input = validOffer(body), id = randomUUID();
    await this.transaction(async client => {
      await client.query('INSERT INTO offers(id,venue_id) VALUES($1,$2)', [id, venueId]);
      await client.query(`INSERT INTO offer_details(offer_id,title,items,total_boxes,price_minor,original_price_minor,pickup_window_start,pickup_window_end,expires_at,storage_confirmed)
        VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10)`, [id, input.title, JSON.stringify(input.items), input.totalBoxes, input.priceMinor, input.originalPriceMinor, input.pickupWindowStart, input.pickupWindowEnd, input.expiresAt, input.storageConfirmed]);
    });
    return this.getOffer(id);
  }
  @Post('venues/:venueId/offers/:offerId/close') @OperationAccess('closeOffer')
  async closeOffer(@Param('offerId') id: string) {
    await this.db.query("UPDATE offer_details SET status='CLOSED' WHERE offer_id=$1", [id]);
    return this.getOffer(id);
  }
  @Get('orders') @OperationAccess('listMyOrders')
  async listMyOrders(@Req() req: AuthRequest) {
    const { rows } = await this.db.query(`${this.orderSelect} WHERE o.buyer_id=$1 ORDER BY d.created_at DESC LIMIT 100`, [req.principal!.id]);
    return { items: rows.map(row => this.order(row, req.principal!.id)), nextCursor: null };
  }
  @Post('orders') @OperationAccess('createOrder')
  async createOrder(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = validOrder(body), buyerId = req.principal!.id, requestKey = key(req);
    const orderId = await this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${buyerId}:${requestKey}`]);
      const existing = await client.query('SELECT order_id FROM booking_idempotency WHERE buyer_id=$1 AND key=$2', [buyerId, requestKey]);
      if (existing.rows[0]) return String(existing.rows[0].order_id);
      const result = await client.query(`${this.offerSelect} WHERE o.id=$1 FOR UPDATE OF d`, [input.offerId]);
      const current = result.rows[0];
      if (!current) throw new NotFoundException('Бокс не найден');
      const now = Date.now(), pickup = Date.parse(input.pickupAt), start = new Date(current.pickup_window_start).getTime(), end = new Date(current.pickup_window_end).getTime();
      if (current.status !== 'PUBLISHED' || end < now + 15 * MINUTE) throw new ConflictException('Бронирование этого бокса уже закрыто');
      if (pickup < Math.max(start, now + 15 * MINUTE) || pickup > end) throw new BadRequestException('Выберите время внутри окна получения, не раньше чем через 15 минут');
      if (current.total_boxes - current.reserved_boxes - current.fulfilled_boxes < input.quantity) throw new ConflictException('Столько боксов уже нет в наличии');
      const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await client.query('UPDATE offer_details SET reserved_boxes=reserved_boxes+$2 WHERE offer_id=$1', [input.offerId, input.quantity]);
      await client.query('INSERT INTO orders(id,buyer_id,venue_id) VALUES($1,$2,$3)', [id, buyerId, current.venue_id]);
      await client.query(`INSERT INTO order_details(order_id,offer_id,title,items,quantity,unit_price_minor,original_unit_minor,pickup_at,pickup_window_start,pickup_window_end,payment_method,pickup_code_hash,pickup_code_cipher)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id, input.offerId, current.title, JSON.stringify(current.items), input.quantity, current.price_minor, current.original_price_minor, input.pickupAt, current.pickup_window_start, current.pickup_window_end, input.paymentMethod, this.codeHash(id, code), this.encrypt(code)]);
      await client.query('INSERT INTO booking_idempotency(buyer_id,key,order_id) VALUES($1,$2,$3)', [buyerId, requestKey, id]);
      await client.query("INSERT INTO booking_events(id,order_id,type,actor_type) VALUES($1,$2,'ORDER_RESERVED','BUYER')", [randomUUID(), id]);
      return id;
    });
    return this.getOrder(orderId, req);
  }
  @Get('orders/:orderId') @OperationAccess('getOrder')
  async getOrder(@Param('orderId') id: string, @Req() req: AuthRequest) {
    const { rows } = await this.db.query(`${this.orderSelect} WHERE o.id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException();
    return this.order(rows[0], req.principal!.id);
  }
  @Get('venues/:venueId/orders') @OperationAccess('listVenueOrders')
  async listVenueOrders(@Param('venueId') id: string) {
    const { rows } = await this.db.query(`${this.orderSelect} WHERE o.venue_id=$1 ORDER BY d.pickup_at ASC LIMIT 100`, [id]);
    return { items: rows.map(row => this.order(row)), nextCursor: null };
  }
  @Get('orders/:orderId/events') @OperationAccess('listOrderEvents')
  async events(@Param('orderId') id: string) {
    const { rows } = await this.db.query('SELECT id,type,actor_type AS "actorType",reason,occurred_at AS "occurredAt" FROM booking_events WHERE order_id=$1 ORDER BY occurred_at DESC', [id]);
    return { items: rows, nextCursor: null };
  }
  private async transition(id: string, req: AuthRequest, next: 'CANCELLED' | 'FULFILLED' | 'NO_SHOW', body: unknown) {
    await this.transaction(async client => {
      const { rows } = await client.query(`${this.orderSelect} WHERE o.id=$1 FOR UPDATE OF d`, [id]);
      const row = rows[0];
      if (!row) throw new NotFoundException();
      if (row.status === next) return true;
      if (row.status !== 'RESERVED') throw new ConflictException('Бронь уже завершена');
      const owner = row.buyer_id === req.principal!.id && req.principal!.roles.includes('BUYER');
      const now = Date.now(), pickup = new Date(row.pickup_at).getTime(), end = new Date(row.pickup_window_end).getTime();
      if (next === 'CANCELLED') {
        if (owner && now >= pickup) throw new ConflictException('Отменить бронь можно до выбранного времени');
        if (!owner) {
          const reason = object(body).reason;
          if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) throw new BadRequestException('Укажите причину отмены');
        }
      } else if (next === 'FULFILLED') {
        const code = object(body).pickupCode;
        if (now < new Date(row.pickup_window_start).getTime() || now > end) throw new ConflictException('Выдача доступна только в окне получения');
        if (row.code_attempts >= 5) throw new ConflictException('Слишком много неверных попыток');
        if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new BadRequestException('Введите шестизначный код');
        const expected = Buffer.from(row.pickup_code_hash, 'hex'), actual = Buffer.from(this.codeHash(id, code), 'hex');
        if (!timingSafeEqual(expected, actual)) {
          await client.query('UPDATE order_details SET code_attempts=code_attempts+1 WHERE order_id=$1', [id]);
          // Commit the attempt while returning a safe error after the transaction.
          return false;
        }
      } else {
        if (now < Math.min(pickup + 15 * MINUTE, end)) throw new ConflictException('Время для отметки неявки ещё не наступило');
        const reason = object(body).reason;
        if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) throw new BadRequestException('Укажите причину неявки');
      }
      await client.query('UPDATE order_details SET status=$2,updated_at=now(),completed_at=now() WHERE order_id=$1', [id, next]);
      await client.query('UPDATE offer_details SET reserved_boxes=reserved_boxes-$2,fulfilled_boxes=fulfilled_boxes+$3 WHERE offer_id=$1', [row.offer_id, row.quantity, next === 'FULFILLED' ? row.quantity : 0]);
      const reason = next === 'CANCELLED' && !owner || next === 'NO_SHOW' ? String(object(body).reason ?? '') : null;
      await client.query('INSERT INTO booking_events(id,order_id,type,actor_type,reason) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, `ORDER_${next}`, owner ? 'BUYER' : 'STAFF', reason]);
      return true;
    }).then(ok => { if (ok === false) throw new BadRequestException('Неверный код выдачи'); });
    return this.getOrder(id, req);
  }
  @Post('orders/:orderId/cancel') @OperationAccess('cancelOrder')
  cancel(@Param('orderId') id: string, @Req() req: AuthRequest, @Body() body: unknown) { return this.transition(id, req, 'CANCELLED', body); }
  @Post('orders/:orderId/fulfill') @OperationAccess('fulfillOrder')
  fulfill(@Param('orderId') id: string, @Req() req: AuthRequest, @Body() body: unknown) { return this.transition(id, req, 'FULFILLED', body); }
  @Post('orders/:orderId/no-show') @OperationAccess('markNoShow')
  noShow(@Param('orderId') id: string, @Req() req: AuthRequest, @Body() body: unknown) { return this.transition(id, req, 'NO_SHOW', body); }
}
