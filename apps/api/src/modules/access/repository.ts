import { randomUUID } from 'node:crypto';
import type { AccessRepository, Principal, OrderScope, Role, VenueSummary } from './types.js';

export interface SqlClient {
  query(sql: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export class PgAccessRepository implements AccessRepository {
  constructor(private readonly db: SqlClient) {}
  async registerBuyer(issuer: string, subject: string): Promise<Principal | undefined> {
    // The unique identity is the idempotency boundary. Existing roles and disabled
    // accounts are deliberately left untouched, including on concurrent retries.
    await this.db.query(
      "INSERT INTO app_users(id,issuer,subject,roles) VALUES($1,$2,$3,ARRAY['BUYER']::text[]) ON CONFLICT (issuer,subject) DO NOTHING",
      [randomUUID(), issuer, subject]);
    return this.findPrincipal(issuer, subject);
  }
  async findPrincipal(issuer: string, subject: string): Promise<Principal | undefined> {
    const { rows } = await this.db.query(
      'SELECT id, roles FROM app_users WHERE issuer=$1 AND subject=$2 AND active=true', [issuer, subject]);
    const row = rows[0];
    return row ? { id: String(row.id), roles: row.roles as Role[] } : undefined;
  }
  async hasMembership(userId: string, venueId: string): Promise<boolean> {
    const { rows } = await this.db.query('SELECT 1 FROM memberships WHERE user_id=$1 AND venue_id=$2', [userId, venueId]);
    return rows.length > 0;
  }
  async findOrderScope(orderId: string): Promise<OrderScope | undefined> {
    const { rows } = await this.db.query('SELECT buyer_id, venue_id FROM orders WHERE id=$1', [orderId]);
    return rows[0] ? { buyerId: String(rows[0].buyer_id), venueId: String(rows[0].venue_id) } : undefined;
  }
  async findOfferVenue(offerId: string): Promise<string | undefined> {
    const { rows } = await this.db.query('SELECT venue_id FROM offers WHERE id=$1', [offerId]);
    return rows[0] ? String(rows[0].venue_id) : undefined;
  }
  async listVenues(userId: string): Promise<VenueSummary[]> {
    const { rows } = await this.db.query(
      'SELECT v.id, v.name FROM venues v JOIN memberships m ON m.venue_id=v.id WHERE m.user_id=$1 ORDER BY v.id', [userId]);
    return rows.map(row => ({ id: String(row.id), name: String(row.name) }));
  }
}
