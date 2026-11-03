import { API, INSTALLATION } from "./constants";
import type { Stats, Status, Settlements } from "./types";

const uint = (v: unknown): v is string =>
  typeof v === "string" && /^\d+$/.test(v) && v.length < 80;
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));

async function read<T>(
  path: string,
  validate: (data: any) => boolean,
): Promise<T> {
  const response = await fetch(`${API}/${path}`, {
    signal: AbortSignal.timeout(12_000),
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "The data source is busy. Try again in a minute."
        : `The data source returned ${response.status}. Try again.`,
    );
  const data = await response.json();
  if (!data || typeof data !== "object")
    throw new Error("The data source returned an invalid response. Try again.");
  if (data.status === "unavailable")
    throw new Error(
      `Source unavailable (${data.reason || "unknown"}). Progress is paused.`,
    );
  let valid = false;
  try {
    valid = data.installationId === INSTALLATION && validate(data);
  } catch {
    /* Malformed optional envelopes are rejected as incompatible. */
  }
  if (!valid)
    throw new Error(
      "The source format or installation changed. Progress is paused.",
    );
  return data as T;
}
export const fetchStatus = () =>
  read<Status>(
    "status",
    (d) =>
      d.schemaVersion === 1 &&
      date(d.generatedAt) &&
      !!d.builder &&
      ["available", "unavailable"].includes(d.builder.status) &&
      (d.measurement === null ||
        (uint(d.measurement.cumulativeWorkUnits) &&
          date(d.measurement.observedAt) &&
          date(d.measurement.receivedAt) &&
          typeof d.measurement.counterEpoch === "string" &&
          Number.isInteger(d.measurement.rpmMilli) &&
          d.measurement.rpmMilli >= 0 &&
          Number.isInteger(d.measurement.distanceMm) &&
          d.measurement.distanceMm >= 0 &&
          Number.isFinite(d.measurement.staleAfterSeconds) &&
          d.measurement.staleAfterSeconds > 0)),
  );
export const fetchStats = () =>
  read<Stats>(
    "measurement/stats?range=30d",
    (d) =>
      d.schemaVersion === 1 &&
      date(d.generatedAt) &&
      uint(d.lifetime?.acceptedWorkUnits) &&
      Array.isArray(d.activity?.days) &&
      d.activity.days.every(
        (day: any) =>
          date(day.date) &&
          uint(day.observedWorkUnits) &&
          (day.distanceMm === null || uint(day.distanceMm)) &&
          Array.isArray(day.buckets) &&
          day.buckets.every(
            (b: any) =>
              (b.workUnits === null || uint(b.workUnits)) &&
              Number.isInteger(b.startMinuteUtc) &&
              b.startMinuteUtc >= 0 &&
              b.startMinuteUtc < 1440 &&
              b.startMinuteUtc % 30 === 0 &&
              ["complete", "partial", "missing", "future"].includes(
                b.coverage,
              ) &&
              Number.isInteger(b.observedRoundCount) &&
              b.observedRoundCount >= 0 &&
              b.observedRoundCount <= 3,
          ),
      ),
  );
export const fetchSettlements = () =>
  read<Settlements>(
    "settlements?range=24h",
    (d) =>
      d.schemaVersion === 3 &&
      d.status === "available" &&
      date(d.generatedAt) &&
      date(d.window?.startAt) &&
      date(d.window?.endAt) &&
      ["settlementCount", "activeRoundCount", "workAdded"].every((k) =>
        uint(d.summary?.[k]),
      ) &&
      Array.isArray(d.buckets),
  );

export function isFresh(status: Status | undefined, now = Date.now()) {
  const m = status?.measurement;
  return (
    !!m &&
    status?.builder.status === "available" &&
    m.freshness === "online" &&
    ["IDLE", "ACTIVE"].includes(m.coreStatus) &&
    m.provenance === "hardware" &&
    now - Date.parse(m.receivedAt) <= m.staleAfterSeconds * 1000 &&
    now - Date.parse(m.observedAt) <= m.staleAfterSeconds * 1000 &&
    Date.parse(m.receivedAt) <= now + 30_000 &&
    Date.parse(m.observedAt) <= now + 30_000
  );
}
