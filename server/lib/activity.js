const log = (db, entity, entityId, message, actor = 'System') =>
  db.query('INSERT INTO activity_log(entity, entity_id, message, actor) VALUES($1,$2,$3,$4)', [entity, String(entityId), message, actor]);
module.exports = { log };
