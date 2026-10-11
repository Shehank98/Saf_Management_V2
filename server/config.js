// Central place for environment configuration.
const env = process.env;

const config = {
  port: +env.PORT || 3000,
  isProd: env.NODE_ENV === 'production',
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/safari',
  databaseSsl: env.DATABASE_SSL === 'true' || /proxy\.rlwy\.net|\.rlwy\.net/.test(env.DATABASE_URL || ''),
  // Public URL of the site (used in emails and QR codes). Railway sets RAILWAY_PUBLIC_DOMAIN for you.
  appUrl: (env.APP_URL || (env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/$/, ''),
  // Sri Lanka has no daylight saving, so a fixed offset is enough.
  utcOffsetMinutes: env.BUSINESS_UTC_OFFSET_MIN ? +env.BUSINESS_UTC_OFFSET_MIN : 330,
  ticketSecret: env.TICKET_SECRET || '',
  cronSecret: env.CRON_SECRET || '',
  disableScheduler: env.DISABLE_INTERNAL_SCHEDULER === '1',
  // Email goes through a Google Apps Script web app (see /appscript).
  appsScriptUrl: env.APPS_SCRIPT_URL || '',
  appsScriptSecret: env.APPS_SCRIPT_SECRET || '',
  // Payments
  paymentProviders: (env.PAYMENT_PROVIDERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  stripeSecretKey: env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  stripeCurrency: (env.STRIPE_CURRENCY || 'lkr').toLowerCase(),
  payhereMerchantId: env.PAYHERE_MERCHANT_ID || '',
  payhereSecret: env.PAYHERE_MERCHANT_SECRET || '',
  payhereSandbox: env.PAYHERE_SANDBOX !== 'false',
  // First owner account (created once at start-up when no admin exists).
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  adminName: env.ADMIN_NAME || 'Owner',
  seedDemo: env.SEED_DEMO === '1',
};

module.exports = config;
