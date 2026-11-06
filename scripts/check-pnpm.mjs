import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { packageManager } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const version = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
assert.equal(`pnpm@${version}`, packageManager, "Install the pnpm version pinned in package.json");

// pnpm adds document markers only when it writes a separate boot document.
const lockfile = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");
assert(
  !/^---(?=\s|$)/m.test(lockfile),
  "Keep pnpm-lock.yaml in the single-document format required by GitHub dependency tracking",
);
