import { BOSS_ART } from "./art";
import { shortAddress } from "./receipts";
import type { Raid } from "./types";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export const km = (mm: bigint | null) =>
  mm === null ? "Unknown" : `${(Number(mm / 1000n) / 1000).toFixed(2)} km`;
export function raidCard(raid: Raid) {
  const defeated = raid.phase === "slain";
  const players = raid.slayers.slice(0, 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Wheel Raid ${escape(raid.week)} ${defeated ? "slayer card" : "raid progress card"}">
  <rect width="1200" height="630" fill="#111713"/><rect x="24" y="24" width="1152" height="582" rx="16" fill="#1b251e" stroke="#41513c"/>
  <g fill="#f2f1e7" font-family="Arial, sans-serif"><text x="65" y="84" font-size="25" font-weight="700">Wheel Raid</text><text x="65" y="155" font-size="18" fill="#b5bcae">${escape(raid.week)} · ${defeated ? "The seal holds." : "The raid continues."}</text>
  <text x="65" y="217" font-size="46" font-weight="700">${escape(raid.name)}</text><text x="65" y="259" font-size="25" fill="#d5ed9f">${defeated ? "Slain by small paws." : `${Math.round((1 - raid.hp / raid.maxHp) * 100)}% of the boss defeated`}</text>
  <text x="65" y="326" font-size="18" fill="#b5bcae">Real wheel distance · ${escape(km(raid.distanceMm))}</text><text x="65" y="358" font-size="18" fill="#b5bcae">${raid.wheelDamage.toLocaleString("en-US")} work units · ${raid.coverage}% observed coverage</text>
  <text x="65" y="409" font-size="18">${defeated ? "Slayer roster" : "Raid party"} · imported and local signed receipts</text>
  ${players.length ? players.map((p, i) => `<text x="${65 + (i % 2) * 230}" y="${448 + Math.floor(i / 2) * 30}" font-size="18" fill="#d5ed9f">${escape(shortAddress(p.account))} · ${p.damage} damage</text>`).join("") : '<text x="65" y="451" font-size="18" fill="#b5bcae">No player receipts recorded on this device.</text>'}
  <text x="65" y="566" font-size="16" fill="#b5bcae">A real hamster. A weekly boss. One community.</text></g>
  <path fill="#353f30" d="M800 118h230v20h20v230h-20v20H800v-20h-20V138h20Z"/><g transform="translate(742 110) scale(2.25)">${BOSS_ART}</g>
  <desc>${escape(raid.slayers.map((p) => p.account).join(", "))}. Wheel Raid game points have no monetary value. Coverage may be incomplete.</desc></svg>`;
}

export async function downloadCardPng(svg: string, name: string) {
  const picture = new Image();
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await picture.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "This browser could not create a PNG. Download the SVG card instead.",
    );
  context.drawImage(picture, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(
              new Error(
                "The PNG could not be saved. Download the SVG card instead.",
              ),
            ),
      "image/png",
    ),
  );
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
