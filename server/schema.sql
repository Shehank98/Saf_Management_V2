-- Yala Wild Safaris: database schema (PostgreSQL). Money is stored as integer LKR.

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  text PRIMARY KEY,           -- morning | evening | full
  name                text NOT NULL,
  short               text NOT NULL,
  start_time          text NOT NULL,              -- 'HH:MM' 24h
  end_time            text NOT NULL,
  pickup_time         text NOT NULL,
  private_jeep_price  int  NOT NULL,
  shared_seat_price   int  NOT NULL,
  active              boolean NOT NULL DEFAULT true,
  sort                int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS extras (
  id      text PRIMARY KEY,                       -- meals | bino | cam
  name    text NOT NULL,
  price   int  NOT NULL,
  per     text NOT NULL CHECK (per IN ('person','booking')),
  active  boolean NOT NULL DEFAULT true,
  sort    int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS closed_dates (
  date   date PRIMARY KEY,
  reason text NOT NULL DEFAULT 'Park closed'
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('OWNER','STAFF')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partners (
  id             serial PRIMARY KEY,
  type           text NOT NULL CHECK (type IN ('JEEP_DRIVER','GUIDE','MEAL_SUPPLIER')),
  name           text NOT NULL,
  nic            text,
  phone          text,
  email          text NOT NULL,
  area           text,
  languages      text[] NOT NULL DEFAULT '{}',
  vehicle_plate  text,
  vehicle_model  text,
  vehicle_year   int,
  seats          int,
  licence_no     text,
  years_experience int,
  bank_name      text,
  branch         text,
  account_name   text,
  account_no     text,
  default_fee    int NOT NULL DEFAULT 0,
  rating         numeric(3,1) NOT NULL DEFAULT 5.0,
  status         text NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED','ACTIVE','PAUSED','REJECTED')),
  reject_reason  text,
  password_hash  text,
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS partners_email_active ON partners (lower(email)) WHERE status IN ('ACTIVE','PAUSED','APPLIED');

CREATE TABLE IF NOT EXISTS partner_documents (
  id          serial PRIMARY KEY,
  partner_id  int NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  file_name   text NOT NULL,
  mime        text NOT NULL,
  data        bytea NOT NULL,                      -- private: only served to logged-in admins
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_days_off (
  partner_id int NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  date       date NOT NULL,
  PRIMARY KEY (partner_id, date)
);

CREATE TABLE IF NOT EXISTS bookings (
  id             serial PRIMARY KEY,
  code           text NOT NULL UNIQUE,
  type           text NOT NULL DEFAULT 'PRIVATE',
  session_id     text NOT NULL REFERENCES sessions(id),
  date           date NOT NULL,
  guests         int NOT NULL CHECK (guests BETWEEN 1 AND 60),
  children       int NOT NULL DEFAULT 0,
  jeeps          int NOT NULL CHECK (jeeps >= 1),
  pickup_mode    text NOT NULL CHECK (pickup_mode IN ('HOTEL','OFFICE')),
  hotel_name     text,
  pickup_lat     double precision,
  pickup_lng     double precision,
  pickup_km      numeric(6,2),
  lead_name      text NOT NULL,
  phone_cc       text NOT NULL DEFAULT '',
  phone          text NOT NULL,
  email          text NOT NULL,
  notes          text,
  allergy_note   text,
  has_meals      boolean NOT NULL DEFAULT false,
  has_bino       boolean NOT NULL DEFAULT false,
  has_cam        boolean NOT NULL DEFAULT false,
  pay_option     text NOT NULL CHECK (pay_option IN ('DEPOSIT','FULL','AT_PICKUP')),
  total          int NOT NULL,
  paid           int NOT NULL DEFAULT 0,
  refunded       int NOT NULL DEFAULT 0,
  status         text NOT NULL CHECK (status IN ('PENDING_PAYMENT','REQUEST','CONFIRMED','STARTED','COMPLETED','CANCELLED','DECLINED')),
  ticket_sent_at timestamptz,
  started_at     timestamptz,
  started_by     text,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  reminder_sent_at timestamptz,
  hold_until     timestamptz,                      -- PENDING_PAYMENT bookings hold their jeep until then
  created_by     text NOT NULL DEFAULT 'WEB',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings (date, session_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);

CREATE TABLE IF NOT EXISTS booking_meals (
  booking_id int NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_no   int NOT NULL,
  preference text NOT NULL,
  PRIMARY KEY (booking_id, guest_no)
);

CREATE TABLE IF NOT EXISTS booking_extras (
  booking_id int NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  extra_id   text NOT NULL,
  qty        int NOT NULL,
  price      int NOT NULL,                         -- line total at booking time
  PRIMARY KEY (booking_id, extra_id)
);

CREATE TABLE IF NOT EXISTS shared_trips (
  id             text PRIMARY KEY,                 -- e.g. SH-7Q2K (used in the link)
  session_id     text NOT NULL REFERENCES sessions(id),
  date           date NOT NULL,
  seat_price     int NOT NULL,
  seats          int NOT NULL DEFAULT 6,
  min_seats      int NOT NULL DEFAULT 4,
  status         text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LINKS_SENT','CONFIRMED','FULL','STARTED','COMPLETED','CANCELLED')),
  auto_cancel_at timestamptz NOT NULL,
  pay_window_h   int NOT NULL DEFAULT 24,
  started_at     timestamptz,
  started_by     text,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_trips_date_idx ON shared_trips (date);

CREATE TABLE IF NOT EXISTS shared_seats (
  id            serial PRIMARY KEY,
  trip_id       text NOT NULL REFERENCES shared_trips(id),
  seat_no       int NOT NULL,
  code          text NOT NULL,                     -- purchase code (one per person/group), printed on the e-ticket
  name          text NOT NULL,
  phone_cc      text NOT NULL DEFAULT '',
  phone         text NOT NULL,
  email         text,
  hotel_name    text,
  meals         boolean NOT NULL DEFAULT false,
  meal          text NOT NULL DEFAULT 'NONE',
  pay_option    text NOT NULL CHECK (pay_option IN ('NOW','LATER')),
  amount        int NOT NULL,
  status        text NOT NULL CHECK (status IN ('RESERVED','PAYMENT_PENDING','PAID','RELEASED','REFUNDED','CANCELLED')),
  pay_deadline  timestamptz,
  ticket_sent_at timestamptz,
  checked_in_at timestamptz,
  created_by    text NOT NULL DEFAULT 'WEB',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shared_seats_active ON shared_seats (trip_id, seat_no) WHERE status IN ('RESERVED','PAYMENT_PENDING','PAID');
CREATE INDEX IF NOT EXISTS shared_seats_code ON shared_seats (code);

CREATE TABLE IF NOT EXISTS assignments (
  id              serial PRIMARY KEY,
  booking_id      int REFERENCES bookings(id) ON DELETE CASCADE,
  shared_trip_id  text REFERENCES shared_trips(id) ON DELETE CASCADE,
  partner_id      int NOT NULL REFERENCES partners(id),
  role            text NOT NULL CHECK (role IN ('JEEP','GUIDE','MEALS')),
  fee             int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','ACCEPTED','DECLINED')),
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((booking_id IS NOT NULL) <> (shared_trip_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS assignments_booking ON assignments (booking_id);
CREATE INDEX IF NOT EXISTS assignments_trip ON assignments (shared_trip_id);
CREATE INDEX IF NOT EXISTS assignments_partner ON assignments (partner_id);

CREATE TABLE IF NOT EXISTS payments (
  id            serial PRIMARY KEY,
  booking_id    int REFERENCES bookings(id),
  trip_id       text REFERENCES shared_trips(id),
  seat_code     text,                              -- shared-seat purchase code
  provider      text NOT NULL,                     -- mock | stripe | payhere | manual
  provider_ref  text,
  amount        int NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('DEPOSIT','FULL','BALANCE','REFUND')),
  method        text NOT NULL DEFAULT 'CARD' CHECK (method IN ('CARD','CASH','BANK')),
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED')),
  meta          jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_booking ON payments (booking_id);
CREATE INDEX IF NOT EXISTS payments_seat ON payments (seat_code);

CREATE TABLE IF NOT EXISTS payouts (
  id          serial PRIMARY KEY,
  partner_id  int NOT NULL REFERENCES partners(id),
  reference   text NOT NULL,
  method      text NOT NULL CHECK (method IN ('BANK','CASH','CHEQUE')),
  amount      int NOT NULL,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

CREATE TABLE IF NOT EXISTS payout_lines (
  id             serial PRIMARY KEY,
  partner_id     int REFERENCES partners(id),      -- NULL for company-owned costs (camera rental)
  booking_id     int REFERENCES bookings(id),
  shared_trip_id text REFERENCES shared_trips(id),
  trip_code      text NOT NULL,
  trip_date      date NOT NULL,
  session_id     text NOT NULL,
  role           text NOT NULL CHECK (role IN ('JEEP','GUIDE','MEALS','CAMERA')),
  qty            int NOT NULL DEFAULT 1,
  amount         int NOT NULL,                     -- fixed at the moment the trip started
  status         text NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PAID','NA')),
  payout_id      int REFERENCES payouts(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_lines_partner ON payout_lines (partner_id, status);
CREATE INDEX IF NOT EXISTS payout_lines_trip ON payout_lines (trip_code);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('ADMIN','PARTNER')),
  user_id    int NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash text PRIMARY KEY,
  partner_id int NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- Email outbox + log. The worker sends PENDING rows through the Apps Script web app.
CREATE TABLE IF NOT EXISTS email_log (
  id            serial PRIMARY KEY,
  template      text NOT NULL,
  to_addr       text NOT NULL,
  subject       text NOT NULL,
  html          text NOT NULL,
  inline_images jsonb NOT NULL DEFAULT '[]',
  reply_to      text,
  entity        text,
  entity_id     text,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','LOGGED')),
  attempts      int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);
CREATE INDEX IF NOT EXISTS email_log_pending ON email_log (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id         serial PRIMARY KEY,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  message    text NOT NULL,
  actor      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_entity ON activity_log (entity, entity_id);

-- Last scheduler run per job (also used to spread work across instances).
CREATE TABLE IF NOT EXISTS job_runs (
  job     text PRIMARY KEY,
  last_at timestamptz NOT NULL
);

-- Jeeps opened automatically by the shared-trips site (empty ones are cleaned up and never block private bookings)
ALTER TABLE shared_trips ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;

-- Parks / locations (Yala, Udawalawe, ...). Each has its own base on the map, free pickup range, jeeps and session times/prices.
CREATE TABLE IF NOT EXISTS locations (
  id         text PRIMARY KEY,                    -- slug used in links, e.g. yala
  name       text NOT NULL,
  tagline    text NOT NULL DEFAULT '',
  office     text NOT NULL DEFAULT '',
  base_lat   double precision NOT NULL,
  base_lng   double precision NOT NULL,
  radius_km  numeric(5,1) NOT NULL DEFAULT 7,
  fleet      int NOT NULL DEFAULT 4,
  sessions   jsonb NOT NULL DEFAULT '{}',          -- per session: {start,end,pickup,seat,active}; empty = use the main session
  active     boolean NOT NULL DEFAULT true,
  sort       int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shared_trips ADD COLUMN IF NOT EXISTS location_id text NOT NULL DEFAULT 'yala';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_id text NOT NULL DEFAULT 'yala';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS has_guide boolean NOT NULL DEFAULT false;
ALTER TABLE shared_seats ADD COLUMN IF NOT EXISTS pickup_lat double precision;
ALTER TABLE shared_seats ADD COLUMN IF NOT EXISTS pickup_lng double precision;
ALTER TABLE shared_seats ADD COLUMN IF NOT EXISTS pickup_km numeric(6,2);
ALTER TABLE shared_seats ADD COLUMN IF NOT EXISTS has_bino boolean NOT NULL DEFAULT false;
ALTER TABLE shared_seats ADD COLUMN IF NOT EXISTS has_guide boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS shared_trips_loc_idx ON shared_trips (location_id, date);

-- A seat someone is choosing right now: locked to their browser for 15 minutes so nobody else can pick it.
CREATE TABLE IF NOT EXISTS seat_holds (
  trip_id    text NOT NULL REFERENCES shared_trips(id) ON DELETE CASCADE,
  seat_no    int NOT NULL,
  token      text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (trip_id, seat_no)
);

-- Which vehicle does the job, and who handed it over.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS vehicle_plate text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS handed_from int;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS handed_at timestamptz;

-- Phone notifications (Web Push) for partners who installed the portal.
CREATE TABLE IF NOT EXISTS push_subs (
  id         serial PRIMARY KEY,
  partner_id int REFERENCES partners(id) ON DELETE CASCADE,
  admin_id   int,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A stand-in driver who is not a partner: gets a one-trip link to scan tickets and start that trip only.
CREATE TABLE IF NOT EXISTS temp_drivers (
  id             serial PRIMARY KEY,
  token_hash     text NOT NULL UNIQUE,
  booking_id     int REFERENCES bookings(id) ON DELETE CASCADE,
  shared_trip_id text REFERENCES shared_trips(id) ON DELETE CASCADE,
  name           text NOT NULL,
  phone          text NOT NULL,
  plate          text NOT NULL,
  email          text,
  from_partner_id int REFERENCES partners(id),
  created_by     text NOT NULL,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((booking_id IS NOT NULL) <> (shared_trip_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS temp_drivers_trip ON temp_drivers (booking_id, shared_trip_id);
