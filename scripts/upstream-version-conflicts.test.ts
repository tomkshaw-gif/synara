import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUpstreamManifestConflict } from "./lib/upstream-version-conflicts";

const conflict = (ours: string, theirs: string) =>
  `{\n  "name": "test",\n<<<<<<< HEAD\n${ours}\n=======\n${theirs}\n>>>>>>> upstream/main\n  "dependencies": {"upstream-new": "2.0.0"},\n  "scripts": {"personal": "keep-me"}\n}\n`;
const version = (value: string) => `  "version": "${value}",`;

describe("upstream manifest version conflicts", () => {
  it.each([
    ["0.8.7", "0.8.4", "0.8.7"],
    ["0.8.7", "0.10.0", "0.10.0"],
    ["1.0.0", "0.99.99", "1.0.0"],
    ["0.8.7", "0.8.7", "0.8.7"],
  ])("selects %s vs %s without losing merged fields", (ours, theirs, expected) => {
    const result = JSON.parse(
      resolveUpstreamManifestConflict(conflict(version(ours), version(theirs))),
    );
    expect(result).toEqual({
      name: "test",
      version: expected,
      dependencies: { "upstream-new": "2.0.0" },
      scripts: { personal: "keep-me" },
    });
  });
  it("preserves CRLF files", () => {
    const input = conflict(version("0.8.7"), version("0.8.4")).replaceAll("\n", "\r\n");
    const result = resolveUpstreamManifestConflict(input);
    expect(result.replaceAll("\r\n", "")).not.toContain("\n");
    expect(JSON.parse(result).version).toBe("0.8.7");
  });
  it.each([
    [version("0.8.7") + '\n  "scripts": {"custom": "x"},', version("0.8.4")],
    [version("0.8.7-beta.1"), version("0.8.4")],
    [version("00.8.7"), version("0.8.4")],
    ['  "dependencies": {"a": "1"},', '  "dependencies": {"a": "2"},'],
    [version("0.8.7") + "\n||||||| base\n" + version("0.8.3"), version("0.8.4")],
  ])("refuses ambiguous or non-version conflicts", (ours, theirs) => {
    expect(() => resolveUpstreamManifestConflict(conflict(ours, theirs))).toThrow();
  });
  it("refuses a merge failure with no conflict hunk", () => {
    expect(() => resolveUpstreamManifestConflict('{"version":"0.8.7"}')).toThrow();
  });
  it("refuses a resolved file that is still invalid JSON", () => {
    expect(() =>
      resolveUpstreamManifestConflict(conflict(version("0.8.7"), version("0.8.4")) + "oops"),
    ).toThrow();
  });
});

describe("upstream conflict CLI", () => {
  function withRepo(run: (root: string, stage: (file: string, text: string) => void) => void) {
    const root = mkdtempSync(join(tmpdir(), "synara-version-test-"));
    const git = (args: string[], input?: string) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        ...(input !== undefined ? { input } : {}),
        stdio: ["pipe", "pipe", "pipe"],
      });
    try {
      git(["init"]);
      const blob = git(["hash-object", "-w", "--stdin"], '{"version":"0.8.3"}').trim();
      run(root, (file, text) => {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), text);
        git(
          ["update-index", "--index-info"],
          [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\t${file}\n`).join(""),
        );
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const runResolver = (root: string) =>
    execFileSync(
      process.execPath,
      [join(import.meta.dirname, "resolve-upstream-version-conflicts.ts")],
      { cwd: root, stdio: "pipe" },
    );
  it("stages a resolved manifest while retaining both sides' merged fields", () => {
    withRepo((root, stage) => {
      stage("apps/web/package.json", conflict(version("0.8.7"), version("0.8.4")));
      runResolver(root);
      const result = JSON.parse(readFileSync(join(root, "apps/web/package.json"), "utf8"));
      expect(result.version).toBe("0.8.7");
      expect(result.dependencies).toEqual({ "upstream-new": "2.0.0" });
      expect(result.scripts).toEqual({ personal: "keep-me" });
      expect(
        execFileSync("git", ["diff", "--name-only", "--diff-filter=U"], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toBe("");
    });
  });
  it("does not write any manifest when another needs manual resolution", () => {
    withRepo((root, stage) => {
      const supported = conflict(version("0.8.7"), version("0.8.4"));
      stage("apps/desktop/package.json", supported);
      stage(
        "apps/web/package.json",
        conflict('  "scripts": {"a":"1"},', '  "scripts": {"a":"2"},'),
      );
      expect(() => runResolver(root)).toThrow();
      expect(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).toBe(supported);
    });
  });
});
