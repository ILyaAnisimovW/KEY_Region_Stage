import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
const issuer = process.env.OIDC_ISSUER;
if (!issuer || !process.env.DATABASE_URL) throw new Error('OIDC_ISSUER and DATABASE_URL required');
// Local ports may differ when another project already uses 8080.
if (process.env.NODE_ENV === 'production' || !/^http:\/\/localhost(?::[0-9]{1,5})?\/realms\/gourmet-box$/.test(issuer)) throw new Error('Demo seed is local only');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (let i = 1; i <= 4; i++) {
    const id = `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    await client.query('INSERT INTO app_users(id,issuer,subject,roles) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id, issuer, id, [i <= 2 ? 'BUYER' : 'STAFF']]);
  }
  for (let i = 1; i <= 2; i++) {
    const venue = `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const seller = `10000000-0000-4000-8000-${String(i + 2).padStart(12, '0')}`;
    const venueName = i === 1 ? 'Демо-пекарня Gourmet Box' : 'Демо-кафе Gourmet Box';
    await client.query('INSERT INTO venues(id,name,address,timezone) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [venue, venueName, 'Демонстрационная точка, Самара', 'Europe/Samara']);
    await client.query("UPDATE venues SET name=$2,address=$3 WHERE id=$1 AND name=$4 AND address='Demo address'", [venue, venueName, 'Демонстрационная точка, Самара', `Gourmet Demo ${i}`]);
    await client.query('INSERT INTO memberships(user_id,venue_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [seller, venue]);
  }
  const demoVenue = '20000000-0000-4000-8000-000000000001';
  await client.query("UPDATE offer_details d SET expires_at=d.pickup_window_end+interval '90 minutes',storage_confirmed=true FROM offers o WHERE d.offer_id=o.id AND o.venue_id=$1 AND d.title='Вечерняя выпечка' AND d.expires_at IS NULL", [demoVenue]);
  const active = await client.query("SELECT 1 FROM offers o JOIN offer_details d ON d.offer_id=o.id WHERE o.venue_id=$1 AND d.status='PUBLISHED' AND d.pickup_window_end>now()+interval '30 minutes' LIMIT 1", [demoVenue]);
  if (!active.rowCount) {
    const offerId = randomUUID();
    const start = new Date(Date.now() + 45 * 60_000), end = new Date(Date.now() + 3 * 60 * 60_000);
    await client.query('INSERT INTO offers(id,venue_id) VALUES($1,$2)', [offerId, demoVenue]);
    await client.query(`INSERT INTO offer_details(offer_id,title,items,total_boxes,price_minor,original_price_minor,pickup_window_start,pickup_window_end,expires_at,storage_confirmed)
      VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,true)`, [offerId, 'Вечерняя выпечка', JSON.stringify([
      { name: 'Круассан сливочный', quantity: 3, allergens: 'Глютен, молоко, яйца' },
      { name: 'Булочка с корицей', quantity: 2, allergens: 'Глютен, молоко' },
    ]), 8, 20000, 50000, start, end, new Date(end.getTime() + 90 * 60_000)]);
  }
  await client.query('COMMIT');
} catch (e) { await client.query('ROLLBACK'); throw e; }
finally { client.release(); await pool.end(); }
