import { Pool } from 'pg';
const issuer = process.env.OIDC_ISSUER;
if (!issuer || !process.env.DATABASE_URL) throw new Error('OIDC_ISSUER and DATABASE_URL required');
if (process.env.NODE_ENV === 'production' || issuer !== 'http://localhost:8080/realms/gourmet-box') throw new Error('Demo seed is local only');
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
    await client.query('INSERT INTO venues(id,name,address,timezone) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [venue, `Gourmet Demo ${i}`, 'Demo address', 'Europe/Samara']);
    await client.query('INSERT INTO memberships(user_id,venue_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [seller, venue]);
  }
  await client.query('COMMIT');
} catch (e) { await client.query('ROLLBACK'); throw e; }
finally { client.release(); await pool.end(); }
