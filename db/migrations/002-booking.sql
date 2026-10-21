CREATE TABLE offer_details (
  offer_id uuid PRIMARY KEY REFERENCES offers(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED','CLOSED')),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  total_boxes integer NOT NULL CHECK (total_boxes BETWEEN 1 AND 1000),
  reserved_boxes integer NOT NULL DEFAULT 0 CHECK (reserved_boxes >= 0),
  fulfilled_boxes integer NOT NULL DEFAULT 0 CHECK (fulfilled_boxes >= 0),
  price_minor integer NOT NULL CHECK (price_minor >= 100),
  original_price_minor integer NOT NULL CHECK (original_price_minor > price_minor),
  pickup_window_start timestamptz NOT NULL,
  pickup_window_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_boxes + fulfilled_boxes <= total_boxes),
  CHECK (pickup_window_end >= pickup_window_start + interval '30 minutes')
);
CREATE INDEX offer_details_catalog_idx ON offer_details(status, pickup_window_end, created_at DESC);

CREATE TABLE order_details (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES offers(id),
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','FULFILLED','CANCELLED','NO_SHOW')),
  title text NOT NULL,
  items jsonb NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  unit_price_minor integer NOT NULL,
  original_unit_minor integer NOT NULL,
  pickup_at timestamptz NOT NULL,
  pickup_window_start timestamptz NOT NULL,
  pickup_window_end timestamptz NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('AT_PICKUP','ONLINE_LATER')),
  pickup_code_hash text NOT NULL,
  pickup_code_cipher text NOT NULL,
  code_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (pickup_at BETWEEN pickup_window_start AND pickup_window_end)
);
CREATE INDEX order_details_status_idx ON order_details(status, pickup_at);
CREATE INDEX orders_buyer_history_idx ON orders(buyer_id, id);

CREATE TABLE booking_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  type text NOT NULL CHECK (type IN ('ORDER_RESERVED','ORDER_CANCELLED','ORDER_FULFILLED','ORDER_NO_SHOW')),
  actor_type text NOT NULL CHECK (actor_type IN ('BUYER','STAFF')),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_events_order_idx ON booking_events(order_id, occurred_at);

CREATE TABLE booking_idempotency (
  buyer_id uuid NOT NULL REFERENCES app_users(id),
  key uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  PRIMARY KEY(buyer_id, key)
);
