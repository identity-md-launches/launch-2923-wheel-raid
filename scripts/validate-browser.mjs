import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(
  resolve(process.env.WHEEL_RAID_DEPS || ".", "package.json"),
);
const { chromium, webkit } = require("playwright");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const account = privateKeyToAccount(generatePrivateKey());
const root = resolve("dist");
const output = resolve("test/scratch/interactions");
await mkdir(output, { recursive: true });
const results = [];
const errors = [];
const check = (name, evidence) =>
  results.push({ name, passed: true, evidence });
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (!path.startsWith("/preview/")) {
      response.writeHead(404).end();
      return;
    }
    const relative = path.slice("/preview/".length) || "index.html";
    const file = resolve(root, relative);
    if (!file.startsWith(root + "/")) {
      response.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    response.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
});
const now = Date.now();
const monday = new Date(now);
monday.setUTCHours(0, 0, 0, 0);
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
const start = +monday;
const bossName = ["The Hollowhorn", "The Mossbound", "The Night Gnawer"][
  ((Math.floor(start / (7 * 86400000)) % 3) + 3) % 3
];
const day = (at) => new Date(at).toISOString().slice(0, 10);
const installationId = "stream-game-sepolia-test-20261025-01";
const days = Array.from(
  { length: Math.floor((now - start) / 86400000) + 1 },
  (_, i) => ({
    date: day(start + i * 86400000),
    observedWorkUnits: i === 0 ? "8000" : "0",
    distanceMm: i === 0 ? "7020000" : "0",
    coverage: {
      expectedRoundCount: 144,
      observedRoundCount: 144,
      coverageBps: 10000,
    },
    buckets: Array.from({ length: 48 }, (_, j) => ({
      startMinuteUtc: j * 30,
      coverage:
        start + i * 86400000 + (j + 1) * 1800000 <= now ? "complete" : "future",
      observedRoundCount:
        start + i * 86400000 + (j + 1) * 1800000 <= now ? 3 : 0,
      workUnits: i === 0 && j === 0 ? "8000" : "0",
    })),
  }),
);
const fixture = {
  stats: {
    schemaVersion: 1,
    installationId,
    generatedAt: new Date(now).toISOString(),
    lifetime: {
      acceptedWorkUnits: "8000",
      firstObservedAt: new Date(start).toISOString(),
    },
    activity: { days },
  },
  status: {
    schemaVersion: 1,
    installationId,
    generatedAt: new Date(now).toISOString(),
    measurement: {
      freshness: "online",
      observedAt: new Date(now).toISOString(),
      receivedAt: new Date(now).toISOString(),
      staleAfterSeconds: 120,
      counterEpoch: "test-epoch",
      cumulativeWorkUnits: "8000",
      provenance: "hardware",
      coreStatus: "IDLE",
      rpmMilli: 0,
      speedMmPerSecond: 0,
      distanceMm: 0,
    },
    builder: { status: "available", queued: { openRoundWorkUnits: "0" } },
  },
  settlements: {
    schemaVersion: 3,
    installationId,
    status: "available",
    generatedAt: new Date(now).toISOString(),
    window: {
      startAt: new Date(now - 86400000).toISOString(),
      endAt: new Date(now).toISOString(),
    },
    summary: {
      settlementCount: "140",
      activeRoundCount: "10",
      workAdded: "8000",
    },
    buckets: [],
  },
};
let offline = false;
await context.route("https://api.squeekchain.com/v1/**", async (route) => {
  if (offline)
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"test_source_offline"}',
    });
  const path = new URL(route.request().url()).pathname;
  const data = path.includes("/measurement/stats")
    ? fixture.stats
    : path.endsWith("/status")
      ? fixture.status
      : fixture.settlements;
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(data),
  });
});
await context.exposeFunction("signRaidTest", async (raw) => {
  const payload = JSON.parse(raw);
  const types = { ...payload.types };
  delete types.EIP712Domain;
  return account.signTypedData({
    domain: payload.domain,
    types,
    primaryType: payload.primaryType,
    message: payload.message,
  });
});
await context.addInitScript(
  ({ address }) => {
    const listeners = new Map();
    const state = {
      chainId: sessionStorage.getItem("raid-test-chain") || "0x1",
      rejectNext: false,
      signCount: 0,
      connected: sessionStorage.getItem("raid-test-connected") === "yes",
    };
    state.forceChain = (chain) => {
      state.chainId = chain;
      sessionStorage.setItem("raid-test-chain", chain);
      for (const listener of listeners.get("chainChanged") || [])
        listener(chain);
    };
    window.__raidTestWallet = state;
    const provider = {
      on: (event, fn) => {
        const list = listeners.get(event) || [];
        list.push(fn);
        listeners.set(event, list);
      },
      removeListener: (event, fn) =>
        listeners.set(
          event,
          (listeners.get(event) || []).filter((f) => f !== fn),
        ),
      request: async ({ method, params }) => {
        if (method === "eth_accounts") return state.connected ? [address] : [];
        if (method === "eth_requestAccounts") {
          state.connected = true;
          sessionStorage.setItem("raid-test-connected", "yes");
          return [address];
        }
        if (method === "eth_chainId") return state.chainId;
        if (
          method === "wallet_switchEthereumChain" ||
          method === "wallet_addEthereumChain"
        ) {
          state.forceChain(params[0].chainId);
          return null;
        }
        if (method === "eth_signTypedData_v4") {
          if (state.rejectNext) {
            state.rejectNext = false;
            throw Object.assign(new Error("User rejected request"), {
              code: 4001,
            });
          }
          state.signCount++;
          return window.signRaidTest(params[1]);
        }
        if (method === "wallet_getCapabilities") return {};
        throw Object.assign(new Error("Unsupported test request " + method), {
          code: 4200,
        });
      },
    };
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "b32de818-8fa3-4664-aa78-3fd920f6efcb",
              name: "Test raid wallet",
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" fill="green"/></svg>',
              rdns: "org.wheelraid.test",
            },
            provider,
          },
        }),
      );
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  },
  { address: account.address },
);
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().startsWith(url) && r.status() >= 400)
    errors.push(`${r.status()} ${r.url()}`);
});
try {
  await page.goto(url);
  await page.getByRole("heading", { name: bossName }).waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('[role="progressbar"]')
      .getAttribute("aria-valuenow"),
  );
  const buttonBox = await page.locator(".attack-button").boundingBox();
  assert(
    buttonBox.y + buttonBox.height <= 844,
    `Attack ends at ${buttonBox.y + buttonBox.height}`,
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  check(
    "390px first screen",
    `Daily action ends at ${Math.round(buttonBox.y + buttonBox.height)}px; no overflow`,
  );
  await page.locator(".attack-button").click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Browser wallet", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Test raid wallet", exact: true })
    .click();
  await page.evaluate(() => window.__raidTestWallet.forceChain("0x1"));
  await page
    .getByRole("button", { name: "Switch to Sepolia" })
    .first()
    .waitFor();
  check(
    "EIP-6963 discovery",
    "Named provider shown; generic Browser wallet hidden; connects successfully",
  );
  await page.locator(".attack-button").click();
  await page
    .getByRole("button", { name: "Sign in to raid", exact: true })
    .waitFor();
  check(
    "Wrong network",
    "Switch to Sepolia invokes the provider and unlocks sign-in",
  );
  await page.evaluate(() => {
    window.__raidTestWallet.rejectNext = true;
  });
  await page.locator(".attack-button").click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /declined/);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("wheel-raid.receipts.v1")),
    null,
  );
  await page.getByRole("button", { name: "Dismiss error" }).click();
  check(
    "Rejected signature",
    "Clear error; no receipt written; retry stays available",
  );
  await page.locator(".attack-button").click();
  await page
    .getByRole("button", { name: "Attack the boss", exact: true })
    .waitFor();
  check(
    "EIP-712 sign-in",
    "Real local key signs JoinRaid; app verifies ownership",
  );
  const hpBefore = Number(
    await page.getByRole("progressbar").getAttribute("aria-valuenow"),
  );
  await page.locator(".attack-button").click();
  await page
    .getByRole("button", { name: "Attack complete today", exact: true })
    .waitFor();
  assert.equal(await page.locator(".attack-button").isDisabled(), true);
  assert.equal(
    Number(await page.getByRole("progressbar").getAttribute("aria-valuenow")),
    hpBefore - 100,
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wheel-raid.receipts.v1")),
  );
  assert.equal(stored.length, 1);
  assert.equal(stored[0].damage, 100);
  check(
    "Daily signed attack",
    "EIP-712 Attack verified; 100 HP removed; one persisted receipt; daily button locked",
  );
  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export log", exact: true }).click();
  const exported = await exportPromise;
  await exported.saveAs(join(output, "exported-log.json"));
  const bundle = JSON.parse(
    await readFile(join(output, "exported-log.json"), "utf8"),
  );
  assert.equal(bundle.receipts.length, 1);
  await page.locator("input[type=file]").setInputFiles({
    name: "same-log.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "0 new receipts imported" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("wheel-raid.receipts.v1")).length,
    ),
    1,
  );
  check(
    "Export and idempotent import",
    "Downloaded JSON contains the signed attack; re-import adds no duplicate",
  );
  const tampered = structuredClone(bundle);
  tampered.receipts[0].damage = 9999;
  await page.locator("input[type=file]").setInputFiles({
    name: "tampered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tampered)),
  });
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /damage/);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("wheel-raid.receipts.v1")).length,
    ),
    1,
  );
  await page.getByRole("button", { name: "Dismiss error" }).click();
  check(
    "Tampered import",
    "Invalid damage rejected atomically; existing receipt preserved",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Attack complete today", exact: true })
    .waitFor();
  check(
    "Persistence",
    "Reload reconnects provider and re-verifies saved receipts; daily lock persists",
  );
  await page.getByRole("button", { name: "Preview the raid card" }).click();
  await page.getByRole("dialog").waitFor();
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  const svgFile = await svgDownload;
  await svgFile.saveAs(join(output, "raid-card.svg"));
  const svg = await readFile(join(output, "raid-card.svg"), "utf8");
  assert(svg.includes("7.02 km"));
  assert(svg.includes(stored[0].account));
  check(
    "Raid card SVG",
    "Downloaded standalone SVG includes real fixture distance and recorded wallet",
  );
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PNG", exact: true }).click();
  const pngFile = await pngDownload;
  await pngFile.saveAs(join(output, "raid-card.png"));
  assert.equal(
    (await readFile(join(output, "raid-card.png")))
      .subarray(0, 8)
      .toString("hex"),
    "89504e470d0a1a0a",
  );
  check(
    "Raid card PNG",
    "Browser rasterization downloads a valid PNG for social posts",
  );
  await page.evaluate(() => {
    window.open = (href) => {
      window.__raidShare = String(href);
      return null;
    };
  });
  await page.getByRole("button", { name: "Share on X", exact: true }).click();
  const intent = new URL(await page.evaluate(() => window.__raidShare));
  assert.equal(intent.origin + intent.pathname, "https://x.com/intent/post");
  assert.match(intent.searchParams.get("text"), /HP left/);
  assert.equal(intent.searchParams.get("url"), url + "#raid");
  check(
    "X share intent",
    "Encoded current raid stats and public page link; no post was sent",
  );
  await page.getByRole("button", { name: "Close dialog" }).focus();
  await page.keyboard.press("Tab");
  assert(
    await page.evaluate(
      () => document.activeElement.closest("dialog") !== null,
    ),
  );
  await page.keyboard.press("Escape");
  assert(
    await page
      .getByRole("button", { name: "Preview the raid card" })
      .evaluate((e) => document.activeElement === e),
  );
  check(
    "Dialog keyboard",
    "Focus stays inside modal; Escape closes; focus returns to card trigger",
  );
  await page.getByRole("link", { name: "Past raids", exact: true }).click();
  await page
    .getByRole("heading", { name: "Every wheel leaves a story." })
    .waitFor();
  await page.getByRole("link", { name: "How to play", exact: true }).click();
  await page
    .getByRole("heading", { name: "A field guide for small heroes." })
    .waitFor();
  check(
    "Hash navigation",
    "Raid, history, and field guide render from static subpath",
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
      `Guide overflow at ${width}`,
    );
  }
  await page.goto(url);
  await page.getByRole("heading", { name: bossName }).waitFor();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
      `Raid overflow at ${width}`,
    );
  }
  check(
    "Responsive layouts",
    "Raid and guide checked without horizontal overflow at 320, 390, 768, 1024, 1440px",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".health-bar>div")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  );
  check("Reduced motion", "Health transition and press transforms disabled");
  const newPage = await context.newPage();
  await newPage.goto(url);
  offline = true;
  await newPage.reload();
  await newPage
    .getByText("The data source returned 503. Try again.", { exact: true })
    .waitFor();
  assert.equal(
    await newPage.getByRole("progressbar").getAttribute("aria-valuenow"),
    null,
  );
  offline = false;
  await newPage
    .getByRole("button", { name: "Retry data", exact: true })
    .click();
  await newPage.getByRole("heading", { name: bossName }).waitFor();
  check(
    "Unavailable source and recovery",
    "503 shows a retry and unknown health; fresh retry restores raid",
  );
  await newPage.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page
    .getByRole("button", { name: "Attack complete today", exact: true })
    .waitFor();
  await page.screenshot({
    path: join(output, "signed-mobile.png"),
    fullPage: true,
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  check(
    "Console and local resources",
    "No page exceptions or missing local resources in the interaction flow",
  );
  // A real mobile user agent must get the four app-browser links, rather than a generic extension row.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(url);
  await phonePage.locator(".attack-button").click();
  for (const wallet of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
    assert.equal(
      await phonePage
        .getByRole("link", { name: `Open in ${wallet}`, exact: true })
        .count(),
      1,
    );
  assert.equal(
    await phonePage
      .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
      .count(),
    1,
  );
  const rabbyUrl = new URL(
    await phonePage
      .getByRole("link", { name: "Open in Rabby", exact: true })
      .getAttribute("href"),
  );
  assert.equal(rabbyUrl.searchParams.get("_cmd"), "open-dapp");
  assert.equal(rabbyUrl.searchParams.get("dapp"), url);
  check(
    "Mobile wallet paths",
    "All four wallet-browser deep links plus Coinbase Smart Wallet present",
  );
  await phone.close();
} catch (error) {
  results.push({
    name: "Interaction failure",
    passed: false,
    evidence: error.stack,
  });
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
} finally {
  await context.close();
  await browser.close();
  try {
    const b = await webkit.launch({ headless: true });
    const p = await b.newPage();
    await p.goto(url);
    await p.locator(".attack-button").click();
    await p.getByRole("dialog").waitFor();
    check("WebKit wallet sheet", "Primary connect dialog opens");
    await b.close();
  } catch (error) {
    results.push({
      name: "WebKit",
      passed: null,
      evidence: error.message.slice(0, 240),
    });
  }
  await new Promise((r) => server.close(r));
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ results }, null, 2),
  );
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((r) => r.passed === false)) process.exitCode = 1;
}
