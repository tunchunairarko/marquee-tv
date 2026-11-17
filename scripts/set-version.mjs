#!/usr/bin/env node
// Sync the app version everywhere from a tag or argument.
//   node scripts/set-version.mjs v1.4.0
//   node scripts/set-version.mjs 1.5.0-beta.2
//
// Windows MSI only accepts X.Y.Z or X.Y.Z-N (N numeric), so pre-release
// tags like 1.5.0-beta.2 become 1.5.0-2 in tauri.conf.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = (process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "").trim().replace(/^v/, "");
const m = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
if (!m) {
  console.error(`Invalid version "${raw}". Expected semver like 1.2.3 or 1.2.3-beta.1`);
  process.exit(1);
}
const [, maj, min, pat, pre] = m;
const core = `${maj}.${min}.${pat}`;
const preNum = pre?.match(/(\d+)$/)?.[1];
const bundleVersion = pre ? `${core}-${preNum ?? 0}` : core;

const edit = (file, fn) => {
  const p = join(root, file);
  writeFileSync(p, fn(readFileSync(p, "utf8")));
  console.log(`updated ${file}`);
};

edit("package.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${raw}"`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${bundleVersion}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${raw}"`));

console.log(`version → ${raw} (bundle ${bundleVersion})`);
