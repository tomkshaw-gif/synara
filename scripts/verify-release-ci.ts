import { setTimeout as delay } from "node:timers/promises";
import { evaluateReleaseCi, type ReleaseCiRun } from "./lib/release-ci-gate.ts";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const sha = process.argv[2];
if (
  !repository ||
  !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
  !token ||
  !sha ||
  !/^[a-f0-9]{40}$/.test(sha)
) {
  throw new Error("Expected GITHUB_REPOSITORY, GH_TOKEN and a full release commit SHA.");
}
// Tags and main can be pushed atomically. Allow CI to register and complete,
// but never substitute a previous commit's green run or ignore a failed lane.
const deadline = Date.now() + 45 * 60_000;
const endpoint = new URL(
  `https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs`,
);
endpoint.search = new URLSearchParams({
  head_sha: sha,
  branch: "main",
  event: "push",
  per_page: "100",
}).toString();
while (Date.now() < deadline) {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Unable to verify release CI (GitHub HTTP ${response.status}).`);
  const result = (await response.json()) as { workflow_runs: ReleaseCiRun[] };
  const decision = evaluateReleaseCi(result.workflow_runs, sha, repository);
  console.log(decision.detail);
  if (decision.state === "failed") throw new Error(decision.detail);
  if (decision.state === "passed") process.exit(0);
  await delay(15_000);
}
throw new Error("Release blocked: exact-commit main CI did not pass within 45 minutes.");
