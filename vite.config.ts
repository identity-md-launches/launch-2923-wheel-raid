import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";

const external = process.env.WHEEL_RAID_DEPS;
const require = createRequire(resolve(external || ".", "package.json"));
const packages = [
  "react",
  "react/jsx-runtime",
  "react-dom/client",
  "wagmi",
  "wagmi/connectors/injected",
  "wagmi/connectors/coinbaseWallet",
  "viem",
  "viem/chains",
  "@tanstack/react-query",
];
function esmEntry(name: string) {
  const packageName = name.startsWith("@")
    ? name.split("/").slice(0, 2).join("/")
    : name.split("/")[0];
  const root = dirname(require.resolve(`${packageName}/package.json`));
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const subpath =
    name === packageName ? "." : `.${name.slice(packageName.length)}`;
  const exported = pkg.exports?.[subpath];
  const imported = exported?.import;
  const target = typeof imported === "string" ? imported : imported?.default;
  return target ? resolve(root, target) : require.resolve(name);
}

export default {
  base: "./",
  resolve: {
    alias: external
      ? packages.map((name) => ({
          find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
          replacement: esmEntry(name),
        }))
      : [],
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      onwarn(warning: { code: string }, warn: (warning: unknown) => void) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
};
