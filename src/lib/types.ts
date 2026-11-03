import type { Address, Hex } from "viem";

export interface Measurement {
  freshness: "online" | "stale";
  observedAt: string;
  receivedAt: string;
  staleAfterSeconds: number;
  counterEpoch: string;
  cumulativeWorkUnits: string;
  provenance: string;
  coreStatus: string;
  rpmMilli: number;
  speedMmPerSecond: number;
  distanceMm: number;
}
export interface Status {
  schemaVersion: 1;
  installationId: string;
  generatedAt: string;
  measurement: Measurement | null;
  builder: { status: string; queued?: { openRoundWorkUnits: string } };
}
export interface Bucket {
  startMinuteUtc: number;
  coverage: string;
  observedRoundCount: number;
  workUnits: string | null;
}
export interface Day {
  date: string;
  observedWorkUnits: string;
  distanceMm: string | null;
  coverage: {
    expectedRoundCount: number;
    observedRoundCount: number;
    coverageBps: number;
  };
  buckets: Bucket[];
}
export interface Stats {
  schemaVersion: 1;
  installationId: string;
  generatedAt: string;
  lifetime: { acceptedWorkUnits: string; firstObservedAt: string | null };
  activity: { days: Day[] };
}
export interface Settlements {
  schemaVersion: 3;
  status: string;
  reason?: string;
  installationId: string;
  generatedAt: string;
  window: { startAt: string; endAt: string };
  summary: {
    settlementCount: string;
    activeRoundCount: string;
    workAdded: string;
  };
  buckets: {
    startAt: string;
    endAt: string;
    workAdded: string;
    activeRoundCount: string;
    settlementCount: string;
  }[];
}
export interface Evidence {
  generatedAt: string;
  settlementCount: string;
  activeRoundCount: string;
  workAdded: string;
  windowStart: string;
  windowEnd: string;
  zeroCoverageBuckets: number;
}
export interface Attack {
  version: 1;
  account: Address;
  installationId: string;
  week: string;
  day: string;
  issuedAt: string;
  streak: number;
  critical: boolean;
  damage: number;
  evidence: Evidence;
  signature: Hex;
}
export interface Raid {
  week: string;
  start: number;
  end: number;
  name: string;
  subtitle: string;
  maxHp: number;
  hp: number;
  wheelDamage: bigint;
  playerDamage: number;
  healing: number;
  distanceMm: bigint | null;
  killedAt: number | null;
  coverage: number;
  phase: "active" | "slain" | "escaped";
  slayers: {
    account: Address;
    damage: number;
    attacks: number;
    points: number;
  }[];
}
