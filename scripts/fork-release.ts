// FILE: fork-release.ts
// Purpose: Fork-local release/sync loop for tomkshaw-gif/synara.
//   release <version>  Bump package versions, commit, push main, tag vX.Y.Z, push the tag.
//                      The tag push runs .github/workflows/release-win.yml, which builds and
//                      publishes the unsigned Windows installer the desktop app auto-updates from.
//   sync               Merge upstream/main into main and push. Follow with `release` to ship it.
// Layer: Repo script
// Usage: node scripts/fork-release.ts release 0.8.6
//        node scripts/fork-release.ts sync

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RELEASE_PACKAGE_FILES = [
  "apps/server/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
];

function git(args: string[], { allowFail = false } = {}): string {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
  }
}

function currentBranch(): string {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function assertOnMain(): void {
  const branch = currentBranch();
  if (branch !== "main") {
    throw new Error(`Run from main (currently on '${branch}').`);
  }
}

function assertTagFree(tag: string): void {
  const local = git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
    allowFail: true,
  });
  if (local) {
    throw new Error(`Tag ${tag} already exists locally. Pick a new version.`);
  }
  const remote = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`], {
    allowFail: true,
  });
  if (remote) {
    throw new Error(`Tag ${tag} already exists on origin. Pick a new version.`);
  }
}

function commit(message: string): void {
  const result = spawnSync("git", ["commit", "-m", message], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      "git commit failed. If it reports a missing identity, set one once with:\n" +
        '  git config user.name "Your Name"\n' +
        '  git config user.email "you@users.noreply.github.com"',
    );
  }
}

function release(version: string): void {
  const normalized = version.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`Expected a version like 0.8.6, got '${version}'.`);
  }
  const tag = `v${normalized}`;
  assertOnMain();
  assertTagFree(tag);

  const head = git(["rev-parse", "HEAD"]);
  const remote = git(["ls-remote", "origin", "refs/heads/main"], { allowFail: true });
  if (remote && !remote.startsWith(head)) {
    throw new Error(
      "Local main is not at origin/main's tip or has unpushed commits.\n" +
        "Commit and push your work first so the release tag points at pushed code.",
    );
  }

  run("node", ["scripts/update-release-package-versions.ts", normalized]);
  run("git", ["add", ...RELEASE_PACKAGE_FILES]);
  if (!git(["diff", "--cached", "--stat"])) {
    throw new Error(`Version bump produced no staged change — already at ${normalized}?`);
  }
  commit(`Bump version to ${normalized}`);

  run("git", ["push", "origin", "main"]);
  run("git", ["tag", tag]);
  run("git", ["push", "origin", tag]);

  const origin = git(["remote", "get-url", "origin"]);
  const match = origin.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  console.log(`\nRelease ${tag} pushed. Watch the build:`);
  console.log(`  https://github.com/${match?.[1] ?? "<your-fork>"}/actions`);
  console.log("When it publishes, the desktop app picks it up automatically.");
}

function sync(): void {
  assertOnMain();
  git(["remote", "get-url", "upstream"]); // throws if the remote is missing
  run("git", ["fetch", "upstream"]);

  const merge = spawnSync("git", ["merge", "upstream/main", "--no-edit"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (merge.status !== 0) {
    console.error(
      "\nMerge has conflicts. Resolve them, then:\n" +
        "  git add -A && git commit --no-edit && git push origin main\n" +
        "To abort instead: git merge --abort",
    );
    process.exit(merge.status ?? 1);
  }

  run("git", ["push", "origin", "main"]);
  console.log(
    "\nUpstream merged and pushed. To ship it to your app, run:\n" +
      "  node scripts/fork-release.ts release <next-version>",
  );
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "release") {
    const version = rest[0];
    if (!version) throw new Error("Usage: node scripts/fork-release.ts release <version>");
    release(version);
  } else if (command === "sync") {
    sync();
  } else {
    console.log(
      "Usage:\n" +
        "  node scripts/fork-release.ts release <version>   Ship a release (tag push → CI → auto-update)\n" +
        "  node scripts/fork-release.ts sync                Merge upstream/main into your fork",
    );
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(`\nerror: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
