import { describe, expect, it } from "vitest";
import { evaluateReleaseCi, type ReleaseCiRun } from "./lib/release-ci-gate.ts";
const sha = "a".repeat(40);
const repository = "owner/synara";
const run: ReleaseCiRun = {
  id: 1,
  run_number: 1,
  run_attempt: 1,
  head_sha: sha,
  head_branch: "main",
  event: "push",
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
  html_url: "https://github.com/owner/synara/actions/runs/1",
  repository: { full_name: repository },
};
describe("release CI gate", () => {
  it("accepts only successful CI for the exact main commit", () => {
    expect(evaluateReleaseCi([run], sha, repository).state).toBe("passed");
  });
  it.each([
    { head_sha: "b".repeat(40) },
    { head_branch: "feature" },
    { event: "pull_request" },
    { path: ".github/workflows/release.yml" },
    { repository: { full_name: "other/synara" } },
  ])("ignores unrelated evidence %j", (change) => {
    expect(evaluateReleaseCi([{ ...run, ...change }], sha, repository).state).toBe("waiting");
  });
  it.each(["failure", "cancelled", "timed_out", "skipped", null])(
    "blocks terminal result %s",
    (conclusion) => {
      expect(evaluateReleaseCi([{ ...run, conclusion }], sha, repository).state).toBe("failed");
    },
  );
  it("waits for missing, queued and running evidence", () => {
    expect(evaluateReleaseCi([], sha, repository).state).toBe("waiting");
    for (const status of ["queued", "in_progress"])
      expect(evaluateReleaseCi([{ ...run, status, conclusion: null }], sha, repository).state).toBe(
        "waiting",
      );
  });
  it("does not accept an older success over a newer failure or rerun", () => {
    expect(
      evaluateReleaseCi([run, { ...run, run_number: 2, conclusion: "failure" }], sha, repository)
        .state,
    ).toBe("failed");
    expect(
      evaluateReleaseCi(
        [run, { ...run, run_attempt: 2, status: "in_progress", conclusion: null }],
        sha,
        repository,
      ).state,
    ).toBe("waiting");
  });
});
