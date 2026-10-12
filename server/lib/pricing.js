// All money maths lives here, on the server. The browser's numbers are for display only.
const MEAL_CODES = {
  'Non-veg': 'NON_VEG', 'Vegetarian': 'VEGETARIAN', 'Vegan': 'VEGAN', 'No beef': 'NO_BEEF',
  'No pork': 'NO_PORK', 'Halal': 'HALAL', 'Kids meal': 'KIDS', 'No meal': 'NONE',
};
const MEAL_LABELS = Object.fromEntries(Object.entries(MEAL_CODES).map(([k, v]) => [v, k]));
const MEAL_OPTIONS = Object.keys(MEAL_CODES).filter(k => k !== 'No meal');

const jeepsFor = (guests, maxPerJeep) => Math.max(1, Math.ceil(guests / maxPerJeep));

/** Normalise a list of per-guest meal choices to exactly `n` valid labels. */
function cleanMeals(prefs, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = Array.isArray(prefs) ? prefs[i] : null;
    out.push(MEAL_CODES[p] ? p : 'Non-veg');
  }
  return out;
}

/**
 * total = jeeps x session price + extras. Per-person extras are multiplied by guests;
 * the meal pack is multiplied by the number of guests who actually picked a meal.
 */
function calcBooking({ session, guests, meals, mealPrefs, bino, cam, guide }, conf) {
  const n = Math.max(1, Math.floor(+guests || 1));
  const jeeps = jeepsFor(n, conf.rules.maxPerJeep);
  const prefs = meals ? cleanMeals(mealPrefs, n) : [];
  const mealN = prefs.filter(p => p !== 'No meal').length;
  const ex = conf.extras;
  const base = jeeps * session.jeep;
  const mealsTotal = meals && ex.meals && ex.meals.active ? mealN * ex.meals.price : 0;
  const binoTotal = bino && ex.bino && ex.bino.active ? ex.bino.price : 0;
  const camTotal = cam && ex.cam && ex.cam.active ? ex.cam.price : 0;
  const guideTotal = guide && ex.guide && ex.guide.active ? ex.guide.price : 0;
  return { n, jeeps, base, meals: mealsTotal, mealN: meals ? mealN : 0, bino: binoTotal, cam: camTotal, guide: guideTotal, prefs, total: base + mealsTotal + binoTotal + camTotal + guideTotal };
}

const depositAmount = (total, conf) => Math.round(total * conf.payments.deposit);
const dueNow = (total, pay, conf) => pay === 'FULL' ? total : pay === 'DEPOSIT' ? depositAmount(total, conf) : 0;

/** Policy is [[hours, percent], ...] sorted from the longest notice down. */
function refundPct(hoursLeft, policy) {
  for (const [h, p] of policy) if (hoursLeft > h) return p;
  return 0;
}

function mealSummary(prefs, allergy) {
  const c = {};
  (prefs || []).filter(x => x !== 'No meal').forEach(x => { c[x] = (c[x] || 0) + 1; });
  const t = Object.entries(c).map(([k, v]) => `${v}× ${k}`).join(', ');
  return t + (t && allergy ? ' · ⚠ ' + allergy : '');
}

/** Extras for one shared-seat purchase (binoculars and guide are per group, the meal pack per seat). */
function sharedExtras({ bino, guide }, conf) {
  const ex = conf.extras;
  const b = bino && ex.bino && ex.bino.active ? ex.bino.price : 0;
  const g = guide && ex.guide && ex.guide.active ? ex.guide.price : 0;
  return { bino: b, guide: g, total: b + g };
}

module.exports = { sharedExtras, MEAL_CODES, MEAL_LABELS, MEAL_OPTIONS, jeepsFor, cleanMeals, calcBooking, depositAmount, dueNow, refundPct, mealSummary };
