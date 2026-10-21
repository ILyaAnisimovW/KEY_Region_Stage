ALTER TABLE offer_details ADD COLUMN storage_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE offer_details ADD COLUMN expires_at timestamptz;
