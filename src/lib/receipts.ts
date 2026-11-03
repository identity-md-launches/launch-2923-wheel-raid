import {
  getAddress,
  isAddress,
  keccak256,
  toHex,
  verifyTypedData,
  type Address,
  type Hex,
  type TypedData,
  type TypedDataDomain,
} from "viem";
import { INSTALLATION, STORAGE_KEY } from "./constants";
import { publicClient } from "./client";
import {
  attackDamage,
  isCritical,
  streakFor,
  utcDay,
  weekLabel,
  weekStart,
} from "./raid";
import type { Attack, Evidence } from "./types";

export const domain = {
  name: "Wheel Raid",
  version: "1",
  chainId: 11155111,
  salt: keccak256(toHex(`wheel-raid:${INSTALLATION}`)),
} as const;
export const attackTypes = {
  Attack: [
    { name: "player", type: "address" },
    { name: "week", type: "string" },
    { name: "utcDate", type: "string" },
    { name: "issuedAt", type: "string" },
    { name: "streak", type: "uint32" },
    { name: "critical", type: "bool" },
    { name: "damage", type: "uint32" },
    { name: "evidenceHash", type: "bytes32" },
  ],
} as const;
export const loginTypes = {
  JoinRaid: [
    { name: "player", type: "address" },
    { name: "origin", type: "string" },
    { name: "purpose", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "string" },
    { name: "expiresAt", type: "string" },
  ],
} as const;
export function canonicalEvidence(e: Evidence) {
  return {
    generatedAt: e.generatedAt,
    settlementCount: e.settlementCount,
    activeRoundCount: e.activeRoundCount,
    workAdded: e.workAdded,
    windowStart: e.windowStart,
    windowEnd: e.windowEnd,
    zeroCoverageBuckets: e.zeroCoverageBuckets,
  };
}
export function attackMessage(a: Omit<Attack, "signature">) {
  return {
    player: a.account,
    week: a.week,
    utcDate: a.day,
    issuedAt: a.issuedAt,
    streak: a.streak,
    critical: a.critical,
    damage: a.damage,
    evidenceHash: keccak256(
      toHex(JSON.stringify(canonicalEvidence(a.evidence))),
    ),
  };
}
export async function verifyWalletSignature(parameters: {
  address: Address;
  domain: TypedDataDomain;
  types: TypedData;
  primaryType: string;
  message: Record<string, unknown>;
  signature: Hex;
}) {
  // Recover ordinary EOA signatures locally. Smart wallets use ERC-1271 / ERC-6492 on Sepolia.
  try {
    if (await verifyTypedData(parameters)) return true;
  } catch {
    /* Contract signatures need an RPC read. */
  }
  try {
    return await publicClient.verifyTypedData({
      ...parameters,
      blockTag: "latest",
    });
  } catch {
    throw new Error(
      "This smart wallet’s signature could not be checked on Sepolia. Check your connection and try again.",
    );
  }
}
export async function validateAttack(
  value: unknown,
  now = Date.now(),
): Promise<Attack> {
  const a = value as Attack;
  if (
    !a ||
    a.version !== 1 ||
    a.installationId !== INSTALLATION ||
    !isAddress(a.account || "") ||
    !/^0x[0-9a-fA-F]+$/.test(a.signature || "") ||
    a.signature.length > 32770
  )
    throw new Error(
      "A receipt has an invalid wallet, signature, or installation.",
    );
  const at = Date.parse(a.issuedAt);
  if (
    !Number.isFinite(at) ||
    at > now + 30_000 ||
    a.day !== utcDay(at) ||
    a.week !== weekLabel(weekStart(at))
  )
    throw new Error("A receipt has an invalid date or raid week.");
  if (
    !Number.isInteger(a.streak) ||
    a.streak < 1 ||
    a.streak > 3660 ||
    typeof a.critical !== "boolean" ||
    a.damage !== attackDamage(a.streak, a.critical)
  )
    throw new Error("A receipt has an invalid damage calculation.");
  const e = a.evidence;
  if (
    !e ||
    !["settlementCount", "activeRoundCount", "workAdded"].every((key) =>
      /^\d{1,79}$/.test(String(e[key as keyof Evidence])),
    ) ||
    !Number.isInteger(e.zeroCoverageBuckets) ||
    e.zeroCoverageBuckets < 0 ||
    e.zeroCoverageBuckets > 48 ||
    !Number.isFinite(Date.parse(e.generatedAt)) ||
    Math.abs(at - Date.parse(e.generatedAt)) > 180_000 ||
    !Number.isFinite(Date.parse(e.windowStart)) ||
    !Number.isFinite(Date.parse(e.windowEnd)) ||
    a.critical !== isCritical(e)
  )
    throw new Error("A receipt has invalid settlement evidence.");
  const valid = await verifyWalletSignature({
    address: a.account,
    domain,
    types: attackTypes,
    primaryType: "Attack",
    message: attackMessage(a),
    signature: a.signature,
  });
  if (!valid)
    throw new Error(
      "A receipt signature does not match its wallet. No receipts were imported.",
    );
  return {
    version: 1,
    account: getAddress(a.account),
    installationId: INSTALLATION,
    week: a.week,
    day: a.day,
    issuedAt: a.issuedAt,
    streak: a.streak,
    critical: a.critical,
    damage: a.damage,
    evidence: canonicalEvidence(e),
    signature: a.signature,
  };
}
export async function mergeReceipts(
  existing: Attack[],
  incoming: unknown[],
): Promise<Attack[]> {
  if (incoming.length > 2000 || existing.length + incoming.length > 4000)
    throw new Error("Import up to 2,000 receipts at a time.");
  const verified: Attack[] = [];
  for (const value of incoming) verified.push(await validateAttack(value));
  const merged = new Map<string, Attack>();
  [...existing, ...verified].forEach((a) => {
    const key = `${a.account.toLowerCase()}:${a.day}`;
    const old = merged.get(key);
    // A deterministic first signature wins; re-imports never create another daily attack.
    if (
      !old ||
      a.issuedAt < old.issuedAt ||
      (a.issuedAt === old.issuedAt && a.signature < old.signature)
    )
      merged.set(key, a);
  });
  const result = [...merged.values()].sort(
    (a, b) =>
      a.issuedAt.localeCompare(b.issuedAt) ||
      a.account.localeCompare(b.account),
  );
  for (const a of result)
    if (
      a.streak !==
      streakFor(
        result.filter((r) => r.day < a.day),
        a.account,
        a.day,
      )
    )
      throw new Error(
        "A streak is missing earlier receipts. Export and import the complete raid log.",
      );
  return result;
}
export function readStored(): unknown[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 4000)
    throw new Error(
      "The saved raid log cannot be read. Import a backup to recover it.",
    );
  return data;
}
export function saveReceipts(attacks: Attack[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(attacks));
}
export function receiptBundle(attacks: Attack[]) {
  return JSON.stringify(
    {
      format: "wheel-raid-log",
      version: 1,
      installationId: INSTALLATION,
      exportedAt: new Date().toISOString(),
      receipts: attacks,
    },
    null,
    2,
  );
}
export function parseBundle(raw: string): unknown[] {
  if (raw.length > 4_000_000)
    throw new Error("Choose a raid log smaller than 4 MB.");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Choose a valid Wheel Raid JSON log.");
  }
  if (
    data.format !== "wheel-raid-log" ||
    data.version !== 1 ||
    data.installationId !== INSTALLATION ||
    !Array.isArray(data.receipts)
  )
    throw new Error("This file is not a Wheel Raid log for this installation.");
  return data.receipts;
}
export function shortAddress(account: string) {
  return `${account.slice(0, 6)}…${account.slice(-4)}`;
}
export function unsignedAttack(
  account: Address,
  evidence: Evidence,
  attacks: Attack[],
): Omit<Attack, "signature"> {
  const issuedAt = new Date().toISOString(),
    day = utcDay(issuedAt),
    streak = streakFor(attacks, account, day),
    critical = isCritical(evidence);
  return {
    version: 1,
    account,
    installationId: INSTALLATION,
    week: weekLabel(weekStart(Date.parse(issuedAt))),
    day,
    issuedAt,
    streak,
    critical,
    damage: attackDamage(streak, critical),
    evidence,
  };
}
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const asSignature = (value: string) => value as Hex;
