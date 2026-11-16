import test from "node:test";
import assert from "node:assert/strict";
import { shiftDate, shiftShares, totals } from "../lib/domain.ts";
import { displayDate } from "../lib/client.ts";

test("shift rolls over exactly at 23:00 Moscow, including month and year boundaries", () => {
  assert.equal(shiftDate(new Date("2026-11-16T22:59:59+03:00")), "2026-11-16");
  assert.equal(shiftDate(new Date("2026-11-16T23:00:00+03:00")), "2026-11-17");
  assert.equal(shiftDate(new Date("2026-12-31T23:00:00+03:00")), "2027-01-01");
  assert.equal(shiftDate(new Date("2026-11-17T00:30:00+03:00")), "2026-11-17");
});
test("shares conserve every kopeck", () => {
  for (const amount of [0, 1, 3, 5, 99, 101, 1_000_000]) {
    const shares = shiftShares(amount);
    assert.equal(shares.owner + shares.employee, amount);
    assert.equal(shares.employee, Math.round(amount * .3));
  }
  assert.deepEqual(shiftShares(1_000_000), { employee: 300_000, owner: 700_000 });
});
test("receipt dates use Moscow rather than the UTC calendar day", () => {
  assert.match(displayDate("2026-11-15T21:30:00.000Z"), /^16 ноября 2026/);
  assert.match(displayDate("2026-11-15"), /^15 ноября 2026/);
});
test("partial payments preserve retail, procurement and labor separately", () => {
  assert.deepEqual(totals({ items: [{ components: 10_000_000, cost: 8_500_000, labor: 2_800_000 }], payments: [{ amount: 5_000_000, laborAmount: 1_000_000 }] }), { components: 10_000_000, labor: 2_800_000, cost: 8_500_000, paid: 5_000_000, laborPaid: 1_000_000, total: 12_800_000, remaining: 7_800_000, componentsPaid: 4_000_000 });
});
