# Wheel Raid

A static, wallet-connected weekly boss raid powered by Squeektoshi’s real wheel. The delivered production website is in **`dist/`**. Source, package manifest and lockfile are included.

The app includes live boss health, observed rest healing, EIP-712 sign-in, daily signed attacks, attendance streaks, weekly raid history, damage rankings, game-point settlement, SVG/PNG raid cards and an X share composer. The original forest and boss artwork is local SVG; fonts and wallet marks are bundled locally.

## Run and rebuild

Use Node.js **22.12 or later** and npm.

```sh
npm ci
npm run dev
```

Production preview and rebuild:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`npm run build` recreates the complete `dist/` export. Vite uses `base: './'`; assets are relative and navigation uses hash routes, so the export works under a static gateway subpath without rewrite rules. Serve the folder over HTTP(S). Wallets require HTTPS or localhost.

The optional `WHEEL_RAID_DEPS` environment variable names a directory containing a separate `package.json` and installed `node_modules/`. The toolchain supports this for restricted workspaces. This delivery was checked using an external dependency installation made from the same manifest and lockfile; no dependency directory, package-manager cache or registry archive is included in the repository.

## Play

1. Open **The raid** and connect a wallet. Desktop extensions are discovered by EIP-6963. Phone users can open this page in MetaMask, Coinbase Wallet, Rabby or Phantom. Coinbase’s SDK also offers a Smart Wallet without a relay or project ID.
2. Switch to **Sepolia**, if needed, and sign the sign-in message. It includes the current origin, a random nonce, wallet, purpose and 24-hour expiry.
3. Sign **Attack the boss** once per UTC date. The attack is verified and saved on this device. Nothing sends a transaction, requests token approval or spends gas.
4. Export your party’s JSON log and import other players’ complete logs to merge signed attacks. Back up your log before clearing browser storage or changing devices.
5. Open a raid card to download SVG or PNG. **Share on X** opens a composer containing current raid stats and the page link. Attach the saved PNG if you want the artwork in the post. The app never posts automatically.

## State and multiplayer scope

**Player state is local and portable.** This static edition has no automatic global player database. Boss HP combines shared wheel work with player attacks in the current device’s imported/local raid log; different logs can show different HP and rosters until merged. This scope is labeled in the health panel, party panel, card and field guide. No sample raiders or random live counters are presented as real activity.

Imported files are checked for signatures, installation, dates, damage formula, full streak history and daily duplicates. A deterministic first receipt wins for a wallet/date conflict. Re-importing the same file cannot add another attack. Import is atomic: an invalid file leaves the existing log intact. A complete log is required to carry a streak to another device.

Wallet signatures prove player intent. The included API evidence hash binds a player to their recorded settlement snapshot; it is **not an oracle attestation**. This is a community game, with no competitive anti-cheat server or token economics. Smart-wallet signature checks use Sepolia RPC through viem’s ERC-1271/ERC-6492 support; ordinary EOA signatures verify locally.

Optional NFT/SQK holder bonuses and an on-chain kill monument are outside this MVP.

## Raid rules and actual data

The implementation is pinned to public API installation `stream-game-sepolia-test-20261025-01` on Sepolia (`11155111`). No API key or private service is needed.

| Source | Interval | Use |
| --- | --- | --- |
| [`/v1/status`](https://api.squeekchain.com/v1/status) | 15 seconds | Hardware freshness, RPM, epoch counter and additional live work |
| [`/v1/measurement/stats?range=30d`](https://api.squeekchain.com/v1/measurement/stats?range=30d) | 60 seconds | UTC weekly work/distance, observed coverage and rest intervals |
| [`/v1/settlements?range=24h`](https://api.squeekchain.com/v1/settlements?range=24h) | 60 seconds | Actual rolling-window settlement evidence for critical attacks |

See the [official public API reference](https://docs.squeekchain.com/developers/api/) for source field definitions.

- A week begins Monday at 00:00 UTC and ends the next Monday at 00:00 UTC, after Sunday. Each boss starts with **42,000 HP**.
- Each accepted wheel work unit deals **1 HP**. Historical half-hour buckets are replayed chronologically; a fresh status counter adds work beyond the statistics snapshot. Cumulative counters are parsed as `bigint`.
- A fully observed half-hour with zero work restores **30 HP**, equivalent to 1 HP/minute. Healing is applied when that interval is confirmed, not by inventing a smooth local timer. Incomplete/missing intervals do not heal. Health is capped; a defeated boss stays defeated in the replay.
- The status distance field is a daily figure. Weekly card distance comes from the history’s actual daily distances. The UI shows observed coverage, and missing distances remain unknown.
- An attack starts at **100 damage**; each consecutive UTC date adds 10, capped at 160. Missing a date resets the streak. A **Sleep strike** doubles the damage only when the rolling 24-hour summary has zero active rounds/work, at least one settlement, and at least 46 fully observed zero-work half-hour buckets confirm it. Incomplete evidence never grants a critical.
- Stale, simulated, replayed, faulted, unavailable, incompatible or unreconciled data pauses attacks. Source history must be under 180 seconds old and settlement evidence under 150 seconds old. Counter decreases pause live damage rather than manufacturing work.
- At a successful week’s end, recorded players split **10,000 game points**: `floor(10,000 × player damage / all recorded player damage)`. Rounding can leave a remainder. Points remain projected before the deadline. An escaped boss awards zero. Points have no monetary value and are not SQK.
- Recorded attacks before the observed final hit make the slayer roster. The card lists its top six; the complete roster remains in the page/log. Late attacks do not enter the roster.

The archive displays up to three completed weeks within the API’s 30-day history. Half-hour data cannot establish the exact physical passage that killed a boss; historical kill ordering is a reconstruction at observed bucket boundaries. Missing coverage is disclosed. There is no permanent on-chain kill certificate or indefinite telemetry archive.

## Validation actually performed

On **2026-11-03**, against the production export served under `/preview/`:

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 14/14 logic, API, signature and persistence-format tests passed |
| `npm run build` | Passed; complete relative-URL export produced |
| `node scripts/validate-browser.mjs` | 19 Chromium interaction checks passed; WebKit unavailable |
| Pinned `taste.mjs --out test/scratch/taste` | 16/16 design checks passed at 320, 390 and 1440px |
| Manual production-browser inspection | Live API, mobile/desktop screenshots, history, wallet empty/error sheet, visible keyboard focus and card UI inspected |

The browser interaction script uses explicit test-only API fixtures and a generated EIP-6963 test wallet that signs real EIP-712 messages. It checks actual cryptographic verification, not an app-only bypass. It covers network switching, rejection/retry, daily HP change and lock, reload persistence, log download and tamper rejection, SVG/PNG download, the X intent, modal focus, navigation, offline/retry and phone wallet options. No transaction or social post was sent.

Reproduce the browser script after building:

```sh
npm exec playwright install chromium
node scripts/validate-browser.mjs
node scripts/audit-bundle.mjs
```

It serves and closes its own bounded local preview and writes scratch evidence under `test/scratch/interactions/`. Set `PLAYWRIGHT_BROWSERS_PATH` if browsers are installed in a separate location. The pinned taste probe was provided as assignment input and is not part of this delivery; its final report is retained in `artifacts/taste.json`.

Full six-domain design review, source findings/fixes, evidence and limitations: **[`artifacts/validation.md`](artifacts/validation.md)**. Implemented design tokens and components: **[`DESIGN.md`](DESIGN.md)**.

Known validation limits: WebKit could not launch because its system libraries are missing. Native wallet apps, deployed smart-wallet signatures, screen readers, physical devices, RTL and native browser zoom were not verified. The live public API had one transient transport failure during an early poll and recovered; failure/retry behavior was separately tested. The final build reports a 622 kB main JavaScript chunk (about 190 kB gzip) and an unused dependency’s Node worker-module externalization warning; Chromium interactions completed without app exceptions or missing local assets.

## Source map

- `src/lib/raid.ts`: UTC weeks, wheel/rest replay, streaks, critical evidence, roster and points.
- `src/lib/receipts.ts`: typed messages, EOA/smart-wallet verification, persistence and merge rules.
- `src/lib/api.ts`: public API validation and freshness gates.
- `src/lib/config.ts`: Sepolia and the three wallet entry paths; no relay credentials.
- `src/lib/card.ts`: standalone SVG generation and local PNG conversion.
- `src/components/`: native modal, wallet sheet, original arena and shared icons.
- `public/`: locally bundled runtime artwork, font, favicon and social image.
- `dist/`: finished static website, ready for static hosting.

Font: DM Sans, SIL OFL, notice in `public/fonts/OFL.txt`. Wallet marks: RainbowKit, MIT, notice in `artifacts/licenses/rainbowkit.txt`; Coinbase’s mark retains its official colors. Better Interface / Impeccable guidance attribution and notices are retained under `artifacts/licenses/`. The arena, boss and Wheel Raid mark are original to this implementation.
