const { Pool, types } = require('pg');
const config = require('./config');

// Return DATE columns as 'YYYY-MM-DD' strings, bigint/numeric as numbers.
types.setTypeParser(1082, v => v);
types.setTypeParser(20, v => parseInt(v, 10));
types.setTypeParser(1700, v => parseFloat(v));

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});
pool.on('error', e => console.error('[db] idle client error', e.message));

const query = (text, params) => pool.query(text, params);

/**
 * Run fn inside a transaction. fn receives a client with an extra `after(fn)` method:
 * callbacks registered with it run only after COMMIT (used for emails and live updates).
 */
async function tx(fn) {
  const client = await pool.connect();
  const afters = [];
  client.after = f => afters.push(f);
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    for (const f of afters) {
      try { await f(); } catch (e) { console.error('[db] after-commit hook failed', e); }
    }
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
