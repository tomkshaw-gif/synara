import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolveUpstreamManifestConflict } from "./lib/upstream-version-conflicts.ts";

const allowed = new Set([
  "apps/desktop/package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
]);
const conflicts = execFileSync("git", ["diff", "--name-only", "--diff-filter=U"], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
if (conflicts.length === 0 || conflicts.some((file) => file !== "bun.lock" && !allowed.has(file))) {
  throw new Error("Manual merge required: merge failed without supported conflicts.");
}
// Validate every manifest before touching any of them. Leave lockfile regeneration
// to the workflow after the merged dependency manifests are resolved.
const resolved = conflicts
  .filter((file) => file !== "bun.lock")
  .map((file) => ({
    file,
    contents: resolveUpstreamManifestConflict(readFileSync(file, "utf8")),
  }));
for (const { file, contents } of resolved) {
  writeFileSync(file, contents);
  execFileSync("git", ["add", "--", file]);
}
