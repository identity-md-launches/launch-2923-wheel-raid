import { readdir, stat, lstat, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname, relative } from "node:path";
import assert from "node:assert/strict";

const root = resolve(".");
const output = "artifacts/bundle-audit.json";
const budget = 8_388_608;
const files = [];
const forbidden = [];
async function walk(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Assignment inputs, repository metadata and throwaway validation work are not delivered files.
    if ([".git", ".github", ".imd"].includes(path) || path === "test/scratch")
      continue;
    if (
      [
        "node_modules",
        ".npm",
        ".vite",
        ".cache",
        ".pnpm-store",
        "__pycache__",
      ].includes(entry.name) ||
      entry.name.startsWith(".env") ||
      path === ".gitmodules" ||
      /\.(?:tgz|tar\.gz)$/.test(entry.name)
    ) {
      forbidden.push(path);
      continue;
    }
    if (entry.isSymbolicLink()) {
      forbidden.push(`symlink: ${path}`);
      continue;
    }
    if (entry.isDirectory()) await walk(join(directory, entry.name), path);
    else if (path !== output)
      files.push({
        path,
        bytes: (await stat(join(directory, entry.name))).size,
      });
  }
}
await walk(root);
assert.equal(
  forbidden.length,
  0,
  `Unexpected generated or prohibited paths: ${forbidden.join(", ")}`,
);
for (const path of [
  "package.json",
  "package-lock.json",
  "README.md",
  "DESIGN.md",
  "dist/index.html",
  "dist/favicon.svg",
  "dist/share-card.png",
  "dist/fonts/dm-sans-latin.woff2",
  "src/App.tsx",
])
  assert(
    (await lstat(resolve(path))).isFile(),
    `Required file missing: ${path}`,
  );
const assetReferences = [];
async function checkReference(file, reference) {
  if (/^(?:data:|https?:|#)/.test(reference)) return;
  assert(
    !reference.startsWith("/"),
    `Absolute runtime asset URL in ${file}: ${reference}`,
  );
  const target = resolve(dirname(resolve(file)), reference.split(/[?#]/)[0]);
  assert(
    target.startsWith(resolve("dist") + "/"),
    `Asset escapes export: ${reference}`,
  );
  assert((await stat(target)).isFile(), `Missing asset: ${reference}`);
  assetReferences.push({ from: file, to: relative(root, target) });
}
const html = await readFile("dist/index.html", "utf8");
for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
  await checkReference("dist/index.html", match[1]);
for (const file of files.filter(
  (f) => f.path.startsWith("dist/") && f.path.endsWith(".css"),
)) {
  const css = await readFile(file.path, "utf8");
  for (const match of css.matchAll(/url\(["']?([^\)"']+)["']?\)/g))
    await checkReference(file.path, match[1]);
}
for (const file of files.filter(
  (f) => f.path.startsWith("dist/") && f.path.endsWith(".js"),
)) {
  const js = await readFile(file.path, "utf8");
  for (const match of js.matchAll(/(?:import\(|from)["'](\.\/[^"']+\.js)["']/g))
    await checkReference(file.path, match[1]);
}
for (const marker of [
  "<title>",
  'name="description"',
  'property="og:title"',
  'property="og:image"',
  'rel="icon"',
])
  assert(html.includes(marker), `Missing metadata: ${marker}`);
const totalWithoutReport = files.reduce((sum, file) => sum + file.bytes, 0);
const report = {
  budgetBytes: budget,
  totalBytes: totalWithoutReport,
  reportBytes: 0,
  productionExportBytes: files
    .filter((f) => f.path.startsWith("dist/"))
    .reduce((sum, file) => sum + file.bytes, 0),
  fileCount: files.length + 1,
  withinBudget: true,
  forbiddenPaths: forbidden,
  relativeAssetReferencesChecked: assetReferences.length,
  exclusions: [
    ".git/",
    ".github/",
    ".imd/ assignment inputs",
    "test/scratch/ throwaway evidence",
  ],
  ignoreFilesChanged: false,
  files: files.sort((a, b) => a.path.localeCompare(b.path)),
  assetReferences,
};
let serialized;
for (let pass = 0; pass < 8; pass++) {
  serialized = JSON.stringify(report, null, 2) + "\n";
  const bytes = Buffer.byteLength(serialized);
  if (bytes === report.reportBytes) break;
  report.reportBytes = bytes;
  report.totalBytes = totalWithoutReport + bytes;
  report.withinBudget = report.totalBytes <= budget;
}
serialized = JSON.stringify(report, null, 2) + "\n";
assert.equal(Buffer.byteLength(serialized), report.reportBytes);
await writeFile(output, serialized);
assert(report.withinBudget, `Submission exceeds ${budget} bytes`);
console.log(
  `Bundle: ${report.totalBytes.toLocaleString("en-US")} / ${budget.toLocaleString("en-US")} bytes; dist: ${report.productionExportBytes.toLocaleString("en-US")} bytes; ${assetReferences.length} relative asset references checked; no generated dependency/cache paths.`,
);
