/**
 * User alert rules: conditions, 24h cooldown, and fire-once-per-crossing for level alerts.
 * Run: npm run test-alert-eval
 */
import assert from 'node:assert/strict';
import { evaluateAlert, alertAction, type AlertState } from '../lib/alerts/evaluate-alert';

const now = Date.parse('2026-11-06T16:00:00Z');
const a = (extra: Partial<AlertState>): AlertState => ({
  alert_type: 'price_below', threshold: 100, baseline_value: null, last_triggered_at: null, armed: true, ...extra,
});
const q = (c: number, dp = 0) => ({ c, dp });

// Conditions
assert.equal(evaluateAlert(a({}), q(99), null).triggered, true);
assert.equal(evaluateAlert(a({}), q(101), null).triggered, false);
assert.equal(evaluateAlert(a({}), null, null).triggered, null);
assert.equal(evaluateAlert(a({ alert_type: 'pct_change_down', threshold: 0.05 }), q(90, -5.2), null).triggered, true);
assert.equal(evaluateAlert(a({ alert_type: 'near_52w_high', threshold: 0.02 }), q(99), { week52High: 100, week52Low: 50 }).triggered, true);
assert.equal(evaluateAlert(a({ alert_type: 'near_52w_high', threshold: 0.02 }), q(99), null).triggered, null);
assert.deepEqual(evaluateAlert(a({ alert_type: 'all_time_high', baseline_value: 120 }), q(121), null), { triggered: true, newBaseline: 121 });

// Level alert: fires once, stays quiet while the price stays past the level, re-arms when it crosses back.
assert.equal(alertAction(a({}), true, now), 'fire');
assert.equal(alertAction(a({ armed: false, last_triggered_at: '2026-11-01T16:00:00Z' }), true, now), 'none');
assert.equal(alertAction(a({ armed: false }), false, now), 'rearm');
assert.equal(alertAction(a({ armed: true }), false, now), 'none');
// Unknown data never re-arms.
assert.equal(alertAction(a({ armed: false }), null, now), 'none');
// Re-armed but inside the 24h cooldown: waits.
assert.equal(alertAction(a({ last_triggered_at: '2026-11-06T06:00:00Z' }), true, now), 'none');
assert.equal(alertAction(a({ last_triggered_at: '2026-11-05T15:59:00Z' }), true, now), 'fire');

// Percent alerts ignore armed: once a day while the move holds.
assert.equal(alertAction(a({ alert_type: 'pct_change_up', armed: false }), true, now), 'fire');
assert.equal(alertAction(a({ alert_type: 'pct_change_up', armed: false }), false, now), 'none');

console.log('test-alert-eval: ok');
