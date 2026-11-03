import { MAX_HP } from "./constants";
import type {
  Attack,
  Evidence,
  Raid,
  Stats,
  Status,
  Settlements,
} from "./types";

export const DAY = 86_400_000;
export const utcDay = (time: number | string = Date.now()) =>
  new Date(time).toISOString().slice(0, 10);
export function weekStart(time = Date.now()) {
  const d = new Date(time);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return +d;
}
export function weekLabel(start: number) {
  const thursday = new Date(start + 3 * DAY);
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return `${thursday.getUTCFullYear()}-W${String(Math.round((start - weekStart(+first)) / (7 * DAY)) + 1).padStart(2, "0")}`;
}
export function attackDamage(streak: number, critical: boolean) {
  return (100 + Math.min(Math.max(streak - 1, 0), 6) * 10) * (critical ? 2 : 1);
}
export function streakFor(attacks: Attack[], account: string, day = utcDay()) {
  const days = new Set(
    attacks
      .filter((a) => a.account.toLowerCase() === account.toLowerCase())
      .map((a) => a.day),
  );
  let streak = 1;
  let previous = Date.parse(day) - DAY;
  while (days.has(utcDay(previous))) {
    streak++;
    previous -= DAY;
  }
  return streak;
}
export function makeEvidence(settlements: Settlements, stats: Stats): Evidence {
  const start = Date.parse(settlements.window.startAt),
    end = Math.min(
      Date.parse(settlements.window.endAt),
      Date.parse(stats.generatedAt),
    );
  const completed = stats.activity.days
    .flatMap((day) =>
      day.buckets.map((b) => ({
        ...b,
        at: Date.parse(day.date) + b.startMinuteUtc * 60_000,
      })),
    )
    .filter((b) => b.at >= start && b.at + 1_800_000 <= end);
  return {
    generatedAt: settlements.generatedAt,
    ...settlements.summary,
    windowStart: settlements.window.startAt,
    windowEnd: settlements.window.endAt,
    zeroCoverageBuckets:
      completed.length >= 46 &&
      completed.every((b) => b.coverage === "complete" && b.workUnits === "0")
        ? completed.length
        : 0,
  };
}
export function isCritical(evidence: Evidence) {
  return (
    BigInt(evidence.settlementCount) > 0n &&
    BigInt(evidence.activeRoundCount) === 0n &&
    BigInt(evidence.workAdded) === 0n &&
    evidence.zeroCoverageBuckets >= 46
  );
}

export function buildRaid(
  stats: Stats,
  status: Status | undefined,
  attacks: Attack[],
  start = weekStart(),
  now = Date.now(),
): Raid {
  const week = weekLabel(start),
    end = start + 7 * DAY;
  const bossIndex = ((Math.floor(start / (7 * DAY)) % 3) + 3) % 3;
  const names = ["The Hollowhorn", "The Mossbound", "The Night Gnawer"];
  const subtitles = [
    "Keeper of the broken seal",
    "Root of the restless forest",
    "A shadow with an appetite",
  ];
  const events: { at: number; work: bigint; heal: number; attack?: Attack }[] =
    [];
  let wheelDamage = 0n,
    healing = 0,
    distance = 0n,
    hasDistance = false,
    observed = 0,
    expected = 0;
  for (const day of stats.activity.days) {
    const dayAt = Date.parse(day.date);
    if (dayAt < start || dayAt >= end || dayAt > now) continue;
    if (day.distanceMm !== null) {
      distance += BigInt(day.distanceMm);
      hasDistance = true;
    }
    for (const b of day.buckets) {
      const at = dayAt + b.startMinuteUtc * 60_000;
      if (at > now || at >= end) continue;
      expected += Math.min(
        3,
        Math.max(0, Math.floor((Math.min(now, at + 1_800_000) - at) / 600_000)),
      );
      observed += b.observedRoundCount;
      if (b.coverage === "future") continue;
      if (b.workUnits === null || b.observedRoundCount === 0) continue;
      const work = BigInt(b.workUnits);
      // Incomplete zero buckets are unknown; only fully observed rest restores health.
      events.push({
        at: Math.min(at + 1_800_000, Date.parse(stats.generatedAt), now),
        work,
        heal: work === 0n && b.coverage === "complete" ? 30 : 0,
      });
      wheelDamage += work;
    }
  }
  if (
    status?.measurement &&
    Date.parse(status.measurement.observedAt) >= start &&
    now < end &&
    Date.parse(status.measurement.observedAt) >= Date.parse(stats.generatedAt)
  ) {
    const delta =
      BigInt(status.measurement.cumulativeWorkUnits) -
      BigInt(stats.lifetime.acceptedWorkUnits);
    if (delta > 0n) {
      events.push({
        at: Date.parse(status.measurement.observedAt),
        work: delta,
        heal: 0,
      });
      wheelDamage += delta;
    }
  }
  const currentAttacks = attacks.filter(
    (a) =>
      a.week === week &&
      Date.parse(a.issuedAt) < end &&
      Date.parse(a.issuedAt) <= now,
  );
  currentAttacks.forEach((a) =>
    events.push({ at: Date.parse(a.issuedAt), work: 0n, heal: 0, attack: a }),
  );
  events.sort(
    (a, b) =>
      a.at - b.at ||
      (a.attack?.account || "").localeCompare(b.attack?.account || ""),
  );
  let hp = MAX_HP,
    killedAt: number | null = null,
    playerDamage = 0;
  const players = new Map<
    string,
    {
      account: Attack["account"];
      damage: number;
      attacks: number;
      points: number;
    }
  >();
  for (const e of events) {
    if (killedAt !== null) break;
    if (e.attack) {
      const a = e.attack,
        key = a.account.toLowerCase();
      const player = players.get(key) || {
        account: a.account,
        damage: 0,
        attacks: 0,
        points: 0,
      };
      player.damage += a.damage;
      player.attacks++;
      playerDamage += a.damage;
      players.set(key, player);
      hp = Math.max(0, hp - a.damage);
    } else {
      const gain = Math.min(e.heal, MAX_HP - hp);
      healing += gain;
      hp = Math.min(MAX_HP, hp + gain);
      hp = e.work >= BigInt(hp) ? 0 : hp - Number(e.work);
    }
    if (hp === 0) killedAt = e.at;
  }
  const slayers = [...players.values()].sort(
    (a, b) => b.damage - a.damage || a.account.localeCompare(b.account),
  );
  slayers.forEach(
    (p) =>
      (p.points =
        playerDamage && (killedAt !== null || now < end)
          ? Math.floor((p.damage / playerDamage) * 10_000)
          : 0),
  );
  return {
    week,
    start,
    end,
    name: names[bossIndex],
    subtitle: subtitles[bossIndex],
    maxHp: MAX_HP,
    hp,
    wheelDamage,
    playerDamage,
    healing,
    distanceMm: hasDistance ? distance : null,
    killedAt,
    coverage: expected
      ? Math.min(100, Math.round((observed / expected) * 100))
      : 0,
    phase: killedAt ? "slain" : now >= end ? "escaped" : "active",
    slayers,
  };
}
