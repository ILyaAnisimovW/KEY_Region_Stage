CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  roles text[] NOT NULL CHECK (roles <@ ARRAY['BUYER','STAFF']::text[] AND cardinality(roles)>0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (issuer, subject)
);
CREATE TABLE venues (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL,
  timezone text NOT NULL
);
CREATE TABLE memberships (
  user_id uuid NOT NULL REFERENCES app_users(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  PRIMARY KEY(user_id, venue_id)
);
-- Only the identity/scope part of Order is introduced in this migration.
-- Future order migrations add composition, prices, status and stock transactions.
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  buyer_id uuid NOT NULL REFERENCES app_users(id),
  venue_id uuid NOT NULL REFERENCES venues(id)
);
CREATE TABLE offers (
  id uuid PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES venues(id)
);
CREATE INDEX orders_buyer_idx ON orders(buyer_id);
CREATE INDEX orders_venue_idx ON orders(venue_id);
