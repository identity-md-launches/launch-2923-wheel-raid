import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useAccount,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { keccak256 } from "viem";
import { Arena } from "./components/Arena";
import { Icon } from "./components/Icon";
import { Dialog } from "./components/Dialog";
import { WalletSheet } from "./components/WalletSheet";
import { fetchSettlements, fetchStats, fetchStatus, isFresh } from "./lib/api";
import { INSTALLATION } from "./lib/config";
import {
  attackDamage,
  buildRaid,
  DAY,
  isCritical,
  makeEvidence,
  streakFor,
  utcDay,
  weekStart,
} from "./lib/raid";
import {
  attackMessage,
  attackTypes,
  domain,
  download,
  loginTypes,
  mergeReceipts,
  parseBundle,
  readStored,
  receiptBundle,
  saveReceipts,
  shortAddress,
  unsignedAttack,
  validateAttack,
  verifyWalletSignature,
} from "./lib/receipts";
import { km, raidCard, downloadCardPng } from "./lib/card";
import type { Attack, Raid } from "./lib/types";

type View = "raid" | "history" | "guide";
const number = (value: number | bigint) => value.toLocaleString("en-US");
function timeRemaining(end: number, now: number) {
  const total = Math.max(0, Math.floor((end - now) / 1000));
  return `${Math.floor(total / 86400)}d ${String(Math.floor((total % 86400) / 3600)).padStart(2, "0")}h ${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}m`;
}
function viewFromHash(): View {
  return location.hash === "#history"
    ? "history"
    : location.hash === "#guide"
      ? "guide"
      : "raid";
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [now, setNow] = useState(Date.now());
  const [walletOpen, setWalletOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [cardRaid, setCardRaid] = useState<Raid | null>(null);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [auth, setAuth] = useState<{
    account: string;
    expiresAt: number;
  } | null>(null);
  const [actionError, setActionError] = useState("");
  const [errorSource, setErrorSource] = useState<"attack" | "import">("attack");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);
  const { address, chainId, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const status = useQuery({
    queryKey: ["wheel-status"],
    queryFn: fetchStatus,
    refetchInterval: 15_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const stats = useQuery({
    queryKey: ["wheel-stats"],
    queryFn: fetchStats,
    refetchInterval: 60_000,
    retry: 1,
  });
  const settlements = useQuery({
    queryKey: ["wheel-settlements"],
    queryFn: fetchSettlements,
    refetchInterval: 60_000,
    retry: 1,
  });
  const fresh = !status.isError && isFresh(status.data, now);
  const resting = fresh && status.data?.measurement?.rpmMilli === 0;
  const statsFresh =
    !!stats.data &&
    !stats.isError &&
    now - Date.parse(stats.data.generatedAt) < 180_000;
  const settlementFresh =
    !!settlements.data &&
    !settlements.isError &&
    now - Date.parse(settlements.data.generatedAt) < 150_000;
  const counterOkay =
    !!status.data?.measurement &&
    !!stats.data &&
    BigInt(status.data.measurement.cumulativeWorkUnits) >=
      BigInt(stats.data.lifetime.acceptedWorkUnits);
  const raid = useMemo(
    () =>
      stats.data
        ? buildRaid(
            stats.data,
            fresh && counterOkay ? status.data : undefined,
            attacks,
            weekStart(now),
            now,
          )
        : null,
    [stats.data, status.data, attacks, fresh, counterOkay, now],
  );
  const history = useMemo(
    () =>
      stats.data
        ? [1, 2, 3]
            .map((offset) =>
              buildRaid(
                stats.data!,
                undefined,
                attacks,
                weekStart(now) - offset * 7 * DAY,
                now,
              ),
            )
            .filter((r) => r.distanceMm !== null)
        : [],
    [stats.data, attacks, now],
  );
  const today = utcDay(now);
  const todayAttack = attacks.find(
    (a) =>
      a.account.toLowerCase() === address?.toLowerCase() && a.day === today,
  );
  const streak = address ? streakFor(attacks, address, today) : 1;
  const evidence =
    stats.data && settlements.data
      ? makeEvidence(settlements.data, stats.data)
      : null;
  const critical = evidence ? isCritical(evidence) : false;
  const signedIn =
    !!address &&
    auth?.account.toLowerCase() === address.toLowerCase() &&
    auth.expiresAt > now;
  const canAttack =
    fresh &&
    statsFresh &&
    settlementFresh &&
    counterOkay &&
    storageReady &&
    !storageError &&
    raid?.phase === "active";
  const activeDays = new Set(
    attacks
      .filter((a) => a.account.toLowerCase() === address?.toLowerCase())
      .map((a) => a.day),
  );
  const currentAccount = useRef({ address, chainId });
  currentAccount.current = { address, chainId };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const onHash = () => {
      if (!["#raid", "#history", "#guide"].includes(location.hash)) return;
      setView(viewFromHash());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", onHash);
    let cancelled = false;
    (async () => {
      try {
        const restored = await mergeReceipts([], readStored());
        if (!cancelled) setAttacks(restored);
      } catch {
        if (!cancelled)
          setStorageError(
            "The saved log could not be verified. Your original data is preserved. Use a fresh browser profile or recover from a verified backup.",
          );
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    })();
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", onHash);
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setAuth(null);
    setActionError("");
    setAccountOpen(false);
  }, [address, chainId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = () => {
    void status.refetch();
    void stats.refetch();
    void settlements.refetch();
  };
  const switchNetwork = async () => {
    setErrorSource("attack");
    setActionError("");
    try {
      await switchChainAsync({ chainId: 11155111 });
    } catch {
      setActionError("Switch to Sepolia in your wallet, then try again.");
    }
  };
  const performAttack = async () => {
    if (actionLock.current) return;
    setActionError("");
    setErrorSource("attack");
    if (!isConnected || !address) {
      setWalletOpen(true);
      return;
    }
    if (chainId !== 11155111) {
      await switchNetwork();
      return;
    }
    if (todayAttack || !canAttack || !evidence) return;
    actionLock.current = true;
    const signer = address;
    try {
      if (!signedIn) {
        setBusy("Waiting for sign-in…");
        const issuedAt = new Date().toISOString(),
          expiresAt = new Date(Date.now() + DAY).toISOString();
        const nonce = keccak256(crypto.getRandomValues(new Uint8Array(32)));
        const message = {
          player: signer,
          origin: location.origin,
          purpose: "Join Wheel Raid. No transaction or token approval.",
          nonce,
          issuedAt,
          expiresAt,
        };
        const signature = await signTypedDataAsync({
          domain,
          types: loginTypes,
          primaryType: "JoinRaid",
          message,
        });
        if (
          !(await verifyWalletSignature({
            address: signer,
            domain,
            types: loginTypes,
            primaryType: "JoinRaid",
            message,
            signature,
          }))
        )
          throw new Error("The sign-in signature could not be verified.");
        if (
          currentAccount.current.address !== signer ||
          currentAccount.current.chainId !== 11155111
        )
          throw new Error("The connected account changed. Sign in again.");
        setAuth({ account: signer, expiresAt: Date.parse(expiresAt) });
        setNotice("Signed in. Your daily attack is ready.");
      } else {
        setBusy("Waiting for attack signature…");
        // Refresh evidence immediately before signing, rather than trusting a rendered estimate.
        const [latestSettlements, latestStats, latestStatus] =
          await Promise.all([fetchSettlements(), fetchStats(), fetchStatus()]);
        if (
          !isFresh(latestStatus) ||
          BigInt(latestStatus.measurement!.cumulativeWorkUnits) <
            BigInt(latestStats.lifetime.acceptedWorkUnits) ||
          Date.now() - Date.parse(latestStats.generatedAt) > 180_000 ||
          Date.now() - Date.parse(latestSettlements.generatedAt) > 150_000
        )
          throw new Error(
            "Fresh wheel and settlement data are required. Refresh and try again.",
          );
        if (buildRaid(latestStats, latestStatus, attacks).phase !== "active") {
          refresh();
          throw new Error(
            "The boss has already fallen. Open the raid card to see the recorded slayers.",
          );
        }
        const unsigned = unsignedAttack(
          signer,
          makeEvidence(latestSettlements, latestStats),
          attacks,
        );
        const signature = await signTypedDataAsync({
          domain,
          types: attackTypes,
          primaryType: "Attack",
          message: attackMessage(unsigned),
        });
        if (
          currentAccount.current.address !== signer ||
          currentAccount.current.chainId !== 11155111
        )
          throw new Error(
            "The connected account changed. Try again with the original wallet.",
          );
        if (utcDay() !== unsigned.day)
          throw new Error(
            "The UTC day changed while signing. Sign a fresh attack.",
          );
        const receipt = await validateAttack({ ...unsigned, signature });
        const disk = await mergeReceipts([], readStored());
        if (
          disk.some(
            (a) =>
              a.account.toLowerCase() === signer.toLowerCase() &&
              a.day === unsigned.day,
          )
        )
          throw new Error(
            "This wallet already attacked today in another tab. Reload to see that receipt.",
          );
        const merged = await mergeReceipts(disk, [...attacks, receipt]);
        saveReceipts(merged);
        setAttacks(merged);
        setNow(Date.now());
        setNotice(
          `${number(receipt.damage)} damage dealt. Day ${receipt.streak} of your streak. Receipt saved on this device.`,
        );
        refresh();
      }
    } catch (error) {
      const text = (error as Error).message;
      setActionError(
        /reject|denied|4001/i.test(text)
          ? "Signature declined. Nothing was saved. Try again when you’re ready."
          : /storage|quota/i.test(text)
            ? "Your browser could not save the receipt. Free storage or allow site storage, then try again."
            : text.length < 200
              ? text
              : "The wallet could not sign. Check the wallet prompt and try again.",
      );
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  };
  const importFile = async (file: File) => {
    setErrorSource("import");
    setImporting(true);
    setActionError("");
    try {
      if (file.size > 4_000_000)
        throw new Error("Choose a raid log smaller than 4 MB.");
      const incoming = parseBundle(await file.text());
      const merged = await mergeReceipts(attacks, incoming);
      saveReceipts(merged);
      setAttacks(merged);
      setNow(Date.now());
      setStorageError("");
      setNotice(
        `${merged.length - attacks.length} new receipts imported. Signatures and streaks verified.`,
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const headerWalletLabel =
    isConnected && address
      ? chainId !== 11155111
        ? "Switch to Sepolia"
        : shortAddress(address)
      : "Connect wallet";
  const mainLabel =
    busy ||
    (!isConnected
      ? "Join the raid"
      : chainId !== 11155111
        ? "Switch to Sepolia"
        : todayAttack
          ? "Attack complete today"
          : raid?.phase === "slain"
            ? "Boss defeated"
            : !signedIn
              ? "Sign in to raid"
              : "Attack the boss");
  const sourceLabel = status.isPending
    ? "Connecting to the wheel"
    : fresh
      ? resting
        ? "Squeektoshi is resting"
        : "Squeektoshi is running"
      : "Wheel data paused";

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a href="#raid" className="brand" aria-label="Wheel Raid home">
            <img src="./favicon.svg" width="34" height="34" alt="" />
            <span>
              Wheel Raid<span className="brand-dot">.</span>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            {(["raid", "history", "guide"] as View[]).map((v) => (
              <a
                key={v}
                className={view === v ? "active" : ""}
                href={`#${v}`}
                aria-current={view === v ? "page" : undefined}
              >
                {v === "raid"
                  ? "The raid"
                  : v === "history"
                    ? "Past raids"
                    : "How to play"}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <span className="network">
              <span className="status-dot" />
              Sepolia
            </span>
            <button
              className="button wallet-button"
              onClick={() =>
                !isConnected
                  ? setWalletOpen(true)
                  : chainId !== 11155111
                    ? void switchNetwork()
                    : setAccountOpen(true)
              }
            >
              <Icon name="wallet" size={16} />
              {headerWalletLabel}
            </button>
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(["raid", "history", "guide"] as View[]).map((v) => (
          <a
            key={v}
            className={view === v ? "active" : ""}
            href={`#${v}`}
            aria-current={view === v ? "page" : undefined}
          >
            {v === "raid"
              ? "The raid"
              : v === "history"
                ? "Past raids"
                : "How to play"}
          </a>
        ))}
      </nav>
      <main id="main" className="page" tabIndex={-1}>
        {view === "raid" && (
          <>
            <div className="page-intro">
              <div>
                <h1>Small paws. Big boss.</h1>
                <p>
                  A weekly community raid powered by Squeektoshi’s real wheel.
                </p>
              </div>
              <div className="week-clock">
                <Icon name="clock" />
                <div>
                  <span>Raid ends Sunday</span>
                  <strong>
                    {timeRemaining(weekStart(now) + 7 * DAY, now)}
                  </strong>
                </div>
              </div>
            </div>
            <div className="raid-grid">
              <section className="boss-panel" aria-label="Current weekly boss">
                <div className="boss-heading">
                  <div>
                    <h2>{raid?.name || "The weekly boss"}</h2>
                    <p>{raid?.subtitle || "Waiting for the wheel’s signal"}</p>
                  </div>
                  <span
                    className={`phase-tag ${raid?.phase === "slain" ? "victory" : ""}`}
                  >
                    <span className="status-dot" />
                    {raid?.phase === "slain"
                      ? "Boss slain"
                      : raid?.week || "Weekly raid"}
                  </span>
                </div>
                <div className="arena">
                  <Arena resting={!!resting} slain={raid?.phase === "slain"} />
                  <span className="arena-caption">
                    <Icon name={resting ? "moon" : "wheel"} size={14} />
                    {fresh
                      ? resting
                        ? "The wheel is resting"
                        : "Every work unit lands a hit."
                      : "Awaiting fresh telemetry"}
                  </span>
                  <span className="arena-coordinate" aria-hidden="true">
                    The Forgotten Grove
                  </span>
                </div>
                <div className="health-area">
                  <div className="health-label">
                    <span>
                      <Icon name="shield" size={16} />
                      Boss health · this log
                    </span>
                    <strong>
                      {raid ? number(raid.hp) : "…"}
                      <span> / {number(42_000)} HP</span>
                    </strong>
                  </div>
                  <div
                    className="health-bar"
                    role="progressbar"
                    aria-label="Boss health remaining"
                    aria-valuemin={0}
                    aria-valuemax={42000}
                    aria-valuenow={raid?.hp}
                    aria-valuetext={
                      raid
                        ? `${number(raid.hp)} of 42,000 health remaining`
                        : "Loading boss health"
                    }
                  >
                    <div
                      style={{
                        width: raid ? `${(raid.hp / raid.maxHp) * 100}%` : "0%",
                      }}
                      className={raid?.phase === "slain" ? "empty" : ""}
                    />
                  </div>
                  <div className="health-foot">
                    <span>
                      {raid
                        ? `${Math.round((1 - raid.hp / raid.maxHp) * 100)}% defeated`
                        : "Loading real activity…"}
                    </span>
                    <span>
                      {resting
                        ? "Rest restores 1 HP / min*"
                        : "1 work unit = 1 damage"}
                    </span>
                  </div>
                </div>
              </section>
              <aside className="attack-panel" aria-labelledby="attack-title">
                <div className="attack-heading">
                  <div className="attack-icon">
                    <Icon name="sword" size={24} />
                  </div>
                  <div>
                    <h2 id="attack-title">Make your daily strike</h2>
                    <p>Sign once a day to deal damage.</p>
                  </div>
                </div>
                <div className="attack-estimate">
                  <div>
                    <span>
                      {critical ? "Sleep strike ready" : "Today’s attack power"}
                    </span>
                    <strong>
                      {number(
                        todayAttack?.damage || attackDamage(streak, critical),
                      )}
                      <span> damage</span>
                    </strong>
                  </div>
                  <span className="power-spark">
                    <Icon name="spark" size={32} />
                  </span>
                </div>
                <button
                  className="button primary attack-button"
                  onClick={() => void performAttack()}
                  disabled={
                    !!busy ||
                    (isConnected &&
                      chainId === 11155111 &&
                      (!!todayAttack || !canAttack))
                  }
                >
                  <Icon name={todayAttack ? "check" : "sword"} />
                  {mainLabel}
                  {!todayAttack && !busy && <Icon name="arrow" size={18} />}
                </button>
                <p className="action-hint">
                  {todayAttack
                    ? "Saved here. Your next attack unlocks at 00:00 UTC."
                    : !isConnected
                      ? "Connect, sign in, then attack. No gas required."
                      : !canAttack
                        ? "Waiting for fresh wheel and settlement data."
                        : !signedIn
                          ? "Sign a gas-free message to verify your wallet."
                          : "Sign today’s attack. This does not send a transaction."}
                </p>
                {actionError && errorSource === "attack" && (
                  <ErrorNotice
                    message={actionError}
                    onDismiss={() => setActionError("")}
                  />
                )}
                <div className="streak-section">
                  <div className="section-line">
                    <span>
                      <Icon name="flame" size={16} />
                      Attendance streak
                    </span>
                    <strong>
                      {address
                        ? todayAttack?.streak || Math.max(0, streak - 1)
                        : 0}{" "}
                      days
                    </strong>
                  </div>
                  <div
                    className="streak-days"
                    aria-label="Attendance this UTC week"
                  >
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = utcDay(weekStart(now) + i * DAY);
                      return (
                        <div
                          key={day}
                          className={`${activeDays.has(day) ? "checked" : ""} ${day === today ? "today" : ""}`}
                        >
                          <span>{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                          <span
                            className="day-square"
                            title={`${day}${activeDays.has(day) ? ": attacked" : ": no attack"}`}
                          >
                            {activeDays.has(day) ? (
                              <Icon name="check" size={16} />
                            ) : (
                              i + 1
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p>
                    Consecutive days add +10 damage, up to +60. Miss a day and
                    start fresh.
                  </p>
                </div>
                <a className="text-link attack-guide" href="#guide">
                  How attacks and sleep strikes work{" "}
                  <Icon name="arrow" size={16} />
                </a>
              </aside>
            </div>
            {(status.isError ||
              stats.isError ||
              (!fresh && !status.isPending) ||
              storageError ||
              (!counterOkay && !!stats.data && !!status.data)) && (
              <div className="source-warning" role="status">
                <Icon name="info" />
                <span>
                  {storageError ||
                    (!counterOkay && stats.data && status.data
                      ? "The wheel counter and activity history are reconciling. Live damage and attacks are paused."
                      : status.error?.message ||
                        stats.error?.message ||
                        "Telemetry is stale or not from live hardware. The last known raid is shown; attacks are paused.")}
                </span>
                <button className="button small" onClick={refresh}>
                  Retry data
                </button>
              </div>
            )}
            <section className="telemetry-strip" aria-label="Live wheel data">
              <div className="wheel-state">
                <span className={`telemetry-icon ${resting ? "resting" : ""}`}>
                  <Icon name={resting ? "moon" : "wheel"} size={24} />
                </span>
                <div>
                  <strong>{sourceLabel}</strong>
                  <span>
                    {fresh
                      ? "Real paws behind every point of damage."
                      : "Progress resumes when the signal returns."}
                  </span>
                </div>
                <span className={`live-label ${fresh ? "" : "paused"}`}>
                  <span className="status-dot" />
                  {fresh ? "Live feed" : "Paused"}
                </span>
              </div>
              <div className="telemetry-stat">
                <span>Wheel speed</span>
                <strong>
                  {fresh
                    ? (status.data!.measurement!.rpmMilli / 1000).toFixed(1)
                    : "—"}
                  <small> rpm</small>
                </strong>
              </div>
              <div className="telemetry-stat">
                <span>Distance this week</span>
                <strong>
                  {raid ? km(raid.distanceMm).replace(" km", "") : "—"}
                  <small> km</small>
                </strong>
              </div>
              <div className="telemetry-stat">
                <span>Wheel damage</span>
                <strong>
                  {raid ? number(raid.wheelDamage) : "—"}
                  <small> HP</small>
                </strong>
              </div>
            </section>
            <div className="community-grid">
              <section className="party-section" aria-labelledby="party-title">
                <div className="section-heading">
                  <div>
                    <h2 id="party-title">The raid party</h2>
                    <p>
                      Local and imported signatures. A small army, one log at a
                      time.
                    </p>
                  </div>
                  <span className="count-label">
                    {raid?.slayers.length || 0} raiders
                  </span>
                </div>
                <div className="party-tools">
                  <span>
                    <Icon name="shield" size={15} />
                    Stored on this device
                  </span>
                  <div>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(
                          "wheel-raid-log.json",
                          receiptBundle(attacks),
                          "application/json",
                        )
                      }
                    >
                      <Icon name="download" size={15} />
                      Export log
                    </button>
                    <button
                      className="text-button"
                      disabled={importing || !storageReady}
                      onClick={() => fileInput.current?.click()}
                    >
                      <Icon name="upload" size={15} />
                      {importing ? "Verifying…" : "Import log"}
                    </button>
                    <input
                      className="visually-hidden"
                      type="file"
                      ref={fileInput}
                      accept="application/json,.json"
                      tabIndex={-1}
                      aria-label="Import signed raid log"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void importFile(e.target.files[0]);
                      }}
                    />
                  </div>
                </div>
                {actionError && errorSource === "import" && (
                  <ErrorNotice
                    message={actionError}
                    onDismiss={() => setActionError("")}
                  />
                )}
                {raid?.slayers.length ? (
                  <div className="leaderboard">
                    <div className="leaderboard-head">
                      <span>Raider</span>
                      <span>Damage</span>
                      <span>Loot share</span>
                    </div>
                    {raid.slayers.map((p, i) => (
                      <div className="leaderboard-row" key={p.account}>
                        <span className="raider-name">
                          <span className="rank">{i + 1}</span>
                          <a
                            href={`https://sepolia.etherscan.io/address/${p.account}`}
                            target="_blank"
                            rel="noreferrer"
                            title={p.account}
                          >
                            {shortAddress(p.account)}
                          </a>
                          {p.account.toLowerCase() ===
                            address?.toLowerCase() && (
                            <span className="you-label">you</span>
                          )}
                        </span>
                        <strong>{number(p.damage)}</strong>
                        <span>
                          {((p.damage / raid.playerDamage) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="party-empty">
                    <div className="empty-wheel">
                      <Icon name="sword" size={28} />
                    </div>
                    <h3>Be the first to strike</h3>
                    <p>
                      Make your first signed attack, or import your party’s log
                      to rally the roster.
                    </p>
                    <a
                      className="text-link"
                      href="#attack-title"
                      onClick={() =>
                        document
                          .querySelector<HTMLButtonElement>(".attack-button")
                          ?.focus()
                      }
                    >
                      Prepare your daily strike <Icon name="arrow" size={16} />
                    </a>
                  </div>
                )}
                <p className="party-note">
                  Share exported logs with your party to merge signed attacks.
                  This static edition has no automatic global player sync.
                </p>
              </section>
              <section className="raid-rewards" aria-labelledby="rewards-title">
                <div className="section-heading">
                  <div>
                    <h2 id="rewards-title">A little glory awaits</h2>
                    <p>For everyone who shows up.</p>
                  </div>
                  <Icon name="trophy" size={22} />
                </div>
                <div className="reward-row">
                  <span className="reward-icon">
                    <Icon name="trophy" />
                  </span>
                  <div>
                    <strong>10,000 loot points</strong>
                    <p>
                      Split by player damage after a successful raid closes on
                      Sunday.
                    </p>
                  </div>
                </div>
                <div className="reward-row">
                  <span className="reward-icon">
                    <Icon name="shield" />
                  </span>
                  <div>
                    <strong>A place among the slayers</strong>
                    <p>
                      Every recorded raider before the final hit enters this
                      log’s slayer roster.
                    </p>
                  </div>
                </div>
                <button
                  className="button card-button"
                  disabled={!raid}
                  onClick={() => raid && setCardRaid(raid)}
                >
                  <Icon name="download" size={18} />
                  {raid?.phase === "slain"
                    ? "Get your slayer card"
                    : "Preview the raid card"}
                  <Icon name="arrow" size={16} />
                </button>
                <p className="fine-print">
                  Collectible bragging rights. Points have no monetary value.
                </p>
              </section>
            </div>
            <section className="wheel-rules">
              <div>
                <Icon name="wheel" size={24} />
                <h3>When the wheel turns, we fight.</h3>
                <p>Real work chips away at the seal’s guardian.</p>
              </div>
              <div>
                <Icon name="moon" size={24} />
                <h3>When the hamster naps, we hold.</h3>
                <p>
                  *Fully observed zero-work intervals restore 1 HP per minute.
                  Missing data never counts as sleep.
                </p>
              </div>
              <a className="text-link" href="#guide">
                Read the field guide <Icon name="arrow" size={16} />
              </a>
            </section>
          </>
        )}
        {view === "history" && (
          <>
            <div className="page-intro">
              <div>
                <h1>Every wheel leaves a story.</h1>
                <p>
                  Recent weekly raids, reconstructed from real activity history.
                </p>
              </div>
              <a className="button" href="#raid">
                Return to the raid <Icon name="arrow" size={16} />
              </a>
            </div>
            <section className="history-list" aria-label="Past weekly raids">
              {stats.isPending ? (
                <p>Loading raid history…</p>
              ) : history.length ? (
                history.map((r) => (
                  <article className="history-row" key={r.week}>
                    <div className="history-boss">
                      <svg viewBox="0 0 800 330" aria-hidden="true">
                        <Arena resting={false} slain={r.phase === "slain"} />
                      </svg>
                    </div>
                    <div>
                      <span className="muted">
                        {r.week} ·{" "}
                        {new Date(r.start).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                      <h2>{r.name}</h2>
                      <p>
                        {km(r.distanceMm)} real distance · {r.coverage}%
                        coverage
                      </p>
                    </div>
                    <div className="history-result">
                      <strong
                        className={r.phase === "slain" ? "success-text" : ""}
                      >
                        {r.phase === "slain" ? "Boss slain" : "Boss escaped"}
                      </strong>
                      <span>
                        {r.phase === "slain"
                          ? `${r.slayers.length} recorded slayers`
                          : `${number(r.hp)} HP remained`}
                      </span>
                    </div>
                    <button className="button" onClick={() => setCardRaid(r)}>
                      View raid card <Icon name="arrow" size={16} />
                    </button>
                  </article>
                ))
              ) : (
                <div className="history-empty">
                  <Icon name="clock" size={32} />
                  <h2>The first story is still being written.</h2>
                  <p>
                    No completed week is available in the public history yet.
                  </p>
                  <a href="#raid" className="button">
                    Join the current raid
                  </a>
                </div>
              )}
            </section>
            <section className="history-explainer">
              <h2>Sunday is settlement day.</h2>
              <p>
                A defeated boss locks the slayer roster at its final hit. At
                Monday 00:00 UTC, its 10,000 game points are allocated by
                recorded player damage. For each player, points = floor(10,000 ×
                player damage ÷ all player damage). Rounding may leave a few
                points unassigned.
              </p>
              <p>
                The archive uses the API’s last 30 days. Player history comes
                from verified logs stored or imported on this device. Weeks with
                gaps show their actual coverage; this is an observed
                reconstruction, not an on-chain kill certificate.
              </p>
            </section>
          </>
        )}
        {view === "guide" && (
          <>
            <div className="page-intro">
              <div>
                <h1>A field guide for small heroes.</h1>
                <p>
                  One real hamster. One weekly boss. Your daily bit of courage.
                </p>
              </div>
              <a href="#raid" className="button">
                Return to the raid <Icon name="arrow" size={16} />
              </a>
            </div>
            <div className="guide-grid">
              <section className="guide-content">
                <h2>The wheel does the heavy lifting.</h2>
                <p>
                  Squeektoshi’s wheel powers a seal in the Forgotten Grove.
                  Every Monday at 00:00 UTC, a new guardian wakes with 42,000
                  HP. Each accepted work unit deals one point of damage. Bring
                  it to zero before the following Monday to win.
                </p>
                <h2>Show up. Sign. Strike.</h2>
                <ol>
                  <li>
                    Connect a browser wallet or Coinbase Smart Wallet. On a
                    phone, open this page in your wallet’s browser.
                  </li>
                  <li>
                    Switch to Sepolia and sign the Wheel Raid sign-in message.
                    It identifies your wallet and expires in 24 hours.
                  </li>
                  <li>
                    Sign one daily attack. Your first strike deals 100 damage.
                    Each consecutive UTC day adds 10, capped at 160 damage.
                  </li>
                </ol>
                <p>
                  The date resets at 00:00 UTC. A missed date resets the streak.
                  Your wallet signs EIP-712 messages; it never sends a
                  transaction, pays gas, or grants token approval.
                </p>
                <h2>Naps score too.</h2>
                <p>
                  For each fully observed half-hour with zero work, the boss
                  restores 30 HP, capped at its starting health. A slain boss
                  stays slain. Incomplete intervals do not heal it, and wheel
                  damage is never invented during an outage.
                </p>
                <p>
                  A Sleep strike doubles your daily damage when the rolling
                  24-hour settlement summary has no active rounds, and at least
                  46 fully observed half-hour buckets in that window confirm
                  zero work. Missing coverage does not earn a critical hit.
                </p>
                <h2>Rally your party.</h2>
                <p>
                  Attacks are stored in this browser. Export your raid log and
                  share the JSON file with your party. Import their logs to
                  combine attacks: signatures, calculations, dates, daily
                  limits, and streak histories are checked, and duplicates count
                  once.
                </p>
                <p>
                  Boss health combines shared wheel damage with signed attacks
                  in this device’s log. Different party logs can show different
                  health and slayer rosters until they are merged.
                </p>
                <p>
                  Import the complete log to carry streaks between devices.
                  Browser storage can be cleared; export a backup. This edition
                  does not operate a shared global player database.
                </p>
                <h2>Keep a piece of the victory.</h2>
                <p>
                  After a kill, every wallet with a recorded attack before the
                  final hit appears in this log’s slayer roster. Download the
                  weekly SVG card, which includes observed real distance and the
                  top six recorded slayers. Share your raid’s progress on X at
                  any time.
                </p>
                <h2>What is verified?</h2>
                <p>
                  Wheel and settlement data come directly from Squeekchain’s
                  public API. New readings are polled every 15 seconds; history
                  and settlements every 60 seconds. Stale, simulated, faulted,
                  or incompatible data pauses attacks. Gaps are shown as
                  incomplete coverage.
                </p>
                <p>
                  A signature proves wallet intent. Stored API evidence is not
                  an oracle-signed competitive score, and there is no global
                  anti-cheat server. Loot points are local game points, not SQK,
                  NFTs, or redeemable assets. NFT and SQK holder bonuses and an
                  on-chain kill monument are outside this MVP.
                </p>
                <p>
                  Public API identity: <code>{INSTALLATION}</code>. Data labels
                  and coverage remain visible so a reconstruction is never
                  mistaken for a settled blockchain result.
                </p>
              </section>
              <aside className="guide-aside">
                <Icon name="shield" size={32} />
                <h2>Your wallet stays yours.</h2>
                <p>
                  Wheel Raid requests signatures only. There are no token
                  transfers, approvals, or minting transactions.
                </p>
                <a
                  className="text-link"
                  href="https://docs.squeekchain.com/developers/api/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore the public data <Icon name="external" size={16} />
                </a>
                <a
                  className="text-link"
                  href="https://squeekchain.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Meet Squeekchain <Icon name="external" size={16} />
                </a>
              </aside>
            </div>
          </>
        )}
        {actionError && view !== "raid" && (
          <ErrorNotice
            message={actionError}
            onDismiss={() => setActionError("")}
          />
        )}
      </main>
      <footer className="site-footer">
        <div>
          <a className="footer-brand" href="#raid">
            <Icon name="wheel" size={18} />
            Wheel Raid
          </a>
          <span>Built for the little runner.</span>
        </div>
        <div>
          <span>
            {status.data?.measurement
              ? `Source ${new Date(status.data.measurement.observedAt).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC`
              : "Waiting for source"}{" "}
            · {raid?.coverage ?? "—"}% observed
          </span>
          <a
            href="https://docs.squeekchain.com/developers/api/"
            target="_blank"
            rel="noreferrer"
          >
            Squeekchain data <Icon name="external" size={14} />
          </a>
        </div>
      </footer>
      {notice && (
        <div role="status" className="toast">
          <Icon name="check" size={18} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {walletOpen && <WalletSheet onClose={() => setWalletOpen(false)} />}
      {accountOpen && address && (
        <Dialog title="Your raid wallet" onClose={() => setAccountOpen(false)}>
          <p className="full-address">{address}</p>
          <p className="dialog-intro">
            {signedIn
              ? "Signed in to Wheel Raid. Your signatures stay in your local raid log."
              : "Connected. Sign in from the daily strike panel to join the raid."}
          </p>
          <a
            className="button"
            href={`https://sepolia.etherscan.io/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Sepolia <Icon name="external" size={16} />
          </a>
          <button
            className="button disconnect"
            onClick={() => {
              disconnect();
              setAuth(null);
              setAccountOpen(false);
            }}
          >
            Disconnect wallet
          </button>
        </Dialog>
      )}
      {cardRaid && (
        <CardDialog raid={cardRaid} onClose={() => setCardRaid(null)} />
      )}
    </>
  );
}

function ErrorNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="action-error" role="alert">
      <Icon name="info" />
      <p>{message}</p>
      <button
        className="icon-button"
        aria-label="Dismiss error"
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

function CardDialog({ raid, onClose }: { raid: Raid; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const svg = useMemo(() => raidCard(raid), [raid]);
  const share = useCallback(() => {
    const text =
      raid.phase === "slain"
        ? `Small paws. Big boss. ${raid.name} is down in Wheel Raid ${raid.week}. Squeektoshi powered the raid with ${km(raid.distanceMm)} of real wheel distance. Join the next raid!`
        : `${raid.name} has ${number(raid.hp)} HP left in Wheel Raid ${raid.week}. Every real wheel work unit lands a hit. Rally with Squeektoshi!`;
    const url = new URL(location.href);
    url.hash = "raid";
    window.open(
      `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url.href)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [raid]);
  return (
    <Dialog
      title={
        raid.phase === "slain"
          ? "A victory worth keeping"
          : "Your raid, in a card"
      }
      onClose={onClose}
      className="card-dialog"
    >
      <img
        className="card-preview"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        alt={`${raid.name} weekly ${raid.phase === "slain" ? "slayer" : "progress"} card for ${raid.week}`}
      />
      <p className="dialog-intro">
        {raid.phase === "slain"
          ? "The slayer card includes real observed distance and the top six recorded raiders in this log."
          : "This is a progress card. A slayer card unlocks automatically when the boss falls."}
      </p>
      <div className="card-actions">
        <button
          className="button primary"
          onClick={() =>
            download(
              `wheel-raid-${raid.week}-${raid.phase === "slain" ? "slayers" : "progress"}.svg`,
              svg,
              "image/svg+xml",
            )
          }
        >
          <Icon name="download" size={18} />
          Download SVG
        </button>
        <button
          className="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setSaveError("");
            try {
              await downloadCardPng(svg, `wheel-raid-${raid.week}.png`);
            } catch (error) {
              setSaveError((error as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save PNG"}
        </button>
        <button className="button" onClick={share}>
          Share on X <Icon name="external" size={16} />
        </button>
      </div>
      {saveError && (
        <p className="error-note" role="alert">
          {saveError}
        </p>
      )}
      <p className="fine-print">
        X shares a link and raid stats. Save the PNG to attach the artwork to
        your post.
      </p>
      {raid.slayers.length > 0 && (
        <div className="card-roster">
          <h3>
            {raid.phase === "escaped"
              ? "Raid closed without loot"
              : raid.end <= Date.now() && raid.phase === "slain"
                ? "Settled loot points"
                : "Projected loot points"}
          </h3>
          {raid.slayers.map((p) => (
            <div key={p.account}>
              <span title={p.account}>{shortAddress(p.account)}</span>
              <strong>{number(p.points)} points</strong>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
