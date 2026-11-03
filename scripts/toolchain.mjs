import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

// An optional external installation keeps restricted workspaces free of dependency folders.
const deps = resolve(process.env.WHEEL_RAID_DEPS || ".");
const require = createRequire(join(deps, "package.json"));
const command = process.argv[2];
const extra = process.argv.slice(3);
let binary, args, temporary;
if (command === "typecheck") {
  binary = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
  const config = {
    extends: resolve("tsconfig.json"),
    compilerOptions: {
      baseUrl: join(deps, "node_modules"),
      typeRoots: [join(deps, "node_modules/@types")],
      paths: {
        react: [join(deps, "node_modules/@types/react/index.d.ts")],
        "react/*": [join(deps, "node_modules/@types/react/*")],
        "react-dom/*": [join(deps, "node_modules/@types/react-dom/*")],
      },
    },
    include: [resolve("src"), resolve("vite.config.ts")],
  };
  temporary = mkdtempSync(join(tmpdir(), "wheel-raid-ts-"));
  writeFileSync(join(temporary, "tsconfig.json"), JSON.stringify(config));
  args = ["--project", join(temporary, "tsconfig.json")];
} else if (command === "test") {
  binary = join(dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");
  temporary = mkdtempSync(join(tmpdir(), "wheel-raid-test-"));
  writeFileSync(
    join(temporary, "tsconfig.json"),
    JSON.stringify({
      extends: resolve("tsconfig.json"),
      compilerOptions: {
        baseUrl: join(deps, "node_modules"),
        paths: { "*": [join(deps, "node_modules/*")] },
      },
    }),
  );
  args = [
    "--tsconfig",
    join(temporary, "tsconfig.json"),
    "--test",
    "src/lib/raid.test.ts",
  ];
} else {
  binary = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
  args = [command === "dev" ? "--host" : command, ...extra];
}
const result = spawnSync(process.execPath, [binary, ...args], {
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: join(deps, "node_modules") },
});
if (temporary) rmSync(temporary, { recursive: true, force: true });
process.exit(result.status ?? 1);
