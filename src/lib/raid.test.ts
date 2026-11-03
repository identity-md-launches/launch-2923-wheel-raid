import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  attackDamage,
  buildRaid,
  DAY,
  isCritical,
  makeEvidence,
  streakFor,
  utcDay,
  weekLabel,
  weekStart,
} from "./raid";
import {
  attackMessage,
  attackTypes,
  domain,
  mergeReceipts,
  parseBundle,
  receiptBundle,
  validateAttack,
} from "./receipts";
import { INSTALLATION } from "./constants";
import { publicClient } from "./client";
import type { Attack, Evidence, Stats, Status } from "./types";
import { fetchStatus, isFresh } from "./api";

const start = Date.parse("2026-11-02T00:00:00Z");
const account = privateKeyToAccount(generatePrivateKey());
const evidence = (at: number): Evidence => ({
  generatedAt: new Date(at).toISOString(),
  settlementCount: "144",
  activeRoundCount: "10",
  workAdded: "1000",
  windowStart: new Date(at - DAY).toISOString(),
  windowEnd: new Date(at).toISOString(),
  zeroCoverageBuckets: 0,
});
async function signed(at: number, streak = 1): Promise<Attack> {
  const value: Omit<Attack, "signature"> = {
    version: 1,
    account: account.address,
    installationId: INSTALLATION,
    week: weekLabel(weekStart(at)),
    day: utcDay(at),
    issuedAt: new Date(at).toISOString(),
    streak,
    critical: false,
    damage: attackDamage(streak, false),
    evidence: evidence(at),
  };
  return {
    ...value,
    signature: await account.signTypedData({
      domain,
      types: attackTypes,
      primaryType: "Attack",
      message: attackMessage(value),
    }),
  };
}
function statistics(
  entries: { work: string | null; coverage?: string }[],
  at = start + entries.length * 1_800_000,
): Stats {
  return {
    schemaVersion: 1,
    installationId: INSTALLATION,
    generatedAt: new Date(at).toISOString(),
    lifetime: {
      acceptedWorkUnits: entries
        .reduce((sum, e) => sum + BigInt(e.work || "0"), 0n)
        .toString(),
      firstObservedAt: new Date(start).toISOString(),
    },
    activity: {
      days: [
        {
          date: utcDay(start),
          observedWorkUnits: "0",
          distanceMm: "1234500",
          coverage: {
            expectedRoundCount: entries.length * 3,
            observedRoundCount: entries.length * 3,
            coverageBps: 10000,
          },
          buckets: entries.map((e, i) => ({
            startMinuteUtc: i * 30,
            workUnits: e.work,
            coverage: e.coverage || "complete",
            observedRoundCount: e.work === null ? 0 : 3,
          })),
        },
      ],
    },
  };
}
test("UTC week boundaries and ISO week labels survive year changes", () => {
  assert.equal(weekStart(Date.parse("2026-11-08T23:59:59Z")), start);
  assert.equal(weekStart(start + 7 * DAY), start + 7 * DAY);
  assert.equal(weekLabel(Date.parse("2025-12-29T00:00:00Z")), "2026-W01");
  assert.equal(weekLabel(start), "2026-W45");
});
test("streak bonus caps at 160; sleep strike doubles; missing days reset", async () => {
  const first = await signed(start + 1000);
  assert.equal(streakFor([first], account.address, "2026-11-03"), 2);
  assert.equal(streakFor([first], account.address, "2026-11-04"), 1);
  assert.equal(attackDamage(30, false), 160);
  assert.equal(attackDamage(7, true), 320);
});
test("real work damages, complete zero intervals heal, and gaps never heal", () => {
  const stats = statistics([
    { work: "1000" },
    { work: "0" },
    { work: null },
    { work: "0", coverage: "partial" },
  ]);
  const raid = buildRaid(stats, undefined, [], start, start + DAY);
  assert.equal(raid.hp, 41030);
  assert.equal(raid.healing, 30);
  assert.equal(raid.wheelDamage, 1000n);
  assert.equal(raid.distanceMm, 1234500n);
});
test("healing caps at maximum HP, huge work is safe, and kills never resurrect", () => {
  const stats = statistics([
    { work: "0" },
    { work: "9999999999999999999999999" },
    { work: "0" },
  ]);
  const raid = buildRaid(stats, undefined, [], start, start + DAY);
  assert.equal(raid.hp, 0);
  assert.equal(raid.healing, 0);
  assert.equal(raid.phase, "slain");
  assert.equal(raid.killedAt, start + 3_600_000);
});
test("player attacks before the kill share points; late attacks are excluded", async () => {
  const first = await signed(start + 60_000);
  const late = await signed(start + 2 * DAY);
  const stats = statistics([{ work: "42000" }]);
  const raid = buildRaid(
    stats,
    undefined,
    [first, late],
    start,
    start + 8 * DAY,
  );
  assert.equal(raid.slayers.length, 1);
  assert.equal(raid.slayers[0].points, 10000);
  assert.equal(raid.playerDamage, 100);
});
test("a live cumulative delta adds damage once; a reset cannot invent work", () => {
  const stats = statistics([{ work: "1000" }]);
  const status = {
    measurement: {
      observedAt: new Date(start + 3_600_000).toISOString(),
      cumulativeWorkUnits: "1300",
    },
  } as Status;
  assert.equal(buildRaid(stats, status, [], start, start + DAY).hp, 40700);
  status.measurement!.cumulativeWorkUnits = "3";
  assert.equal(buildRaid(stats, status, [], start, start + DAY).hp, 41000);
});
test("real EIP-712 signatures verify and duplicates count only once", async () => {
  const a = await signed(start + 1000);
  assert.equal((await validateAttack(a)).account, account.address);
  const merged = await mergeReceipts([], [a, a]);
  assert.equal(merged.length, 1);
  assert.equal((await mergeReceipts(merged, [a])).length, 1);
});
test("tampered damage, wrong dates, wrong installations, future dates and missing streak history are rejected", async () => {
  const a = await signed(start + 1000);
  await assert.rejects(validateAttack({ ...a, damage: 5000 }), /damage/);
  await assert.rejects(validateAttack({ ...a, day: "2026-11-01" }), /date/);
  await assert.rejects(
    validateAttack({ ...a, installationId: "other" }),
    /installation/,
  );
  await assert.rejects(validateAttack(a, start - DAY), /date/);
  const streak = await signed(start + DAY, 2);
  await assert.rejects(mergeReceipts([], [streak]), /missing earlier/);
  assert.equal((await mergeReceipts([], [a, streak])).length, 2);
});
test("the signature binds the settlement evidence", async () => {
  const original = publicClient.verifyTypedData;
  publicClient.verifyTypedData = async () => false;
  try {
    const a = await signed(start + 1000);
    await assert.rejects(
      validateAttack({ ...a, evidence: { ...a.evidence, workAdded: "999" } }),
      /signature/,
    );
  } finally {
    publicClient.verifyTypedData = original;
  }
});
test("critical requires observed 24h coverage and recorded zero-work settlements", () => {
  const e = {
    ...evidence(start),
    activeRoundCount: "0",
    workAdded: "0",
    zeroCoverageBuckets: 48,
  };
  assert.equal(isCritical(e), true);
  assert.equal(isCritical({ ...e, zeroCoverageBuckets: 0 }), false);
  assert.equal(isCritical({ ...e, settlementCount: "0" }), false);
  assert.equal(isCritical({ ...e, activeRoundCount: "1" }), false);
});
test("JSON logs round-trip, malformed files and other formats are rejected", async () => {
  const a = await signed(start + 1000);
  assert.equal(
    (await mergeReceipts([], parseBundle(receiptBundle([a])))).length,
    1,
  );
  assert.throws(() => parseBundle("oops"), /valid/);
  assert.throws(() => parseBundle('{"receipts":[]}'), /not a Wheel Raid/);
});
test("a week with no kill escapes at its UTC deadline", () => {
  assert.equal(
    buildRaid(
      statistics([{ work: "1000" }]),
      undefined,
      [],
      start,
      start + 7 * DAY,
    ).phase,
    "escaped",
  );
});

test("critical evidence requires complete observed buckets, not a zero-filled gap", () => {
  const stats = statistics(Array.from({ length: 48 }, () => ({ work: "0" })));
  const settlements = {
    summary: { settlementCount: "144", activeRoundCount: "0", workAdded: "0" },
    window: {
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + DAY).toISOString(),
    },
    generatedAt: new Date(start + DAY).toISOString(),
  } as import("./types").Settlements;
  assert.equal(isCritical(makeEvidence(settlements, stats)), true);
  stats.activity.days[0].buckets[1].coverage = "missing";
  assert.equal(isCritical(makeEvidence(settlements, stats)), false);
});

test("API errors, incompatible schemas and malformed counters are rejected; stale or simulated data never goes live", async () => {
  const original = globalThis.fetch;
  const at = Date.now();
  const valid = {
    schemaVersion: 1,
    installationId: INSTALLATION,
    generatedAt: new Date(at).toISOString(),
    builder: { status: "available" },
    measurement: {
      freshness: "online",
      observedAt: new Date(at).toISOString(),
      receivedAt: new Date(at).toISOString(),
      staleAfterSeconds: 120,
      counterEpoch: "test",
      cumulativeWorkUnits: "8000",
      provenance: "hardware",
      coreStatus: "IDLE",
      rpmMilli: 0,
      distanceMm: 0,
    },
  };
  try {
    for (const data of [
      null,
      {},
      { ...valid, schemaVersion: 2 },
      {
        ...valid,
        measurement: { ...valid.measurement, cumulativeWorkUnits: 8000 },
      },
      { ...valid, measurement: { ...valid.measurement, rpmMilli: -1 } },
    ]) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify(data), { status: 200 });
      await assert.rejects(fetchStatus());
    }
    globalThis.fetch = async () =>
      new Response(JSON.stringify(valid), { status: 200 });
    const parsed = await fetchStatus();
    assert.equal(isFresh(parsed, at), true);
    assert.equal(isFresh(parsed, at + 121000), false);
    parsed.measurement!.provenance = "simulated";
    assert.equal(isFresh(parsed, at), false);
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    await assert.rejects(fetchStatus(), /503/);
  } finally {
    globalThis.fetch = original;
  }
});
