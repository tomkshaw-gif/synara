export interface ReleaseCiRun {
  id: number;
  run_number: number;
  run_attempt: number;
  head_sha: string;
  head_branch: string;
  event: string;
  path: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  repository: { full_name: string };
}

export function evaluateReleaseCi(
  runs: readonly ReleaseCiRun[],
  sha: string,
  repository: string,
):
  | { state: "waiting"; detail: string }
  | { state: "passed"; detail: string }
  | { state: "failed"; detail: string } {
  const latest = runs
    .filter(
      (run) =>
        run.head_sha === sha &&
        run.head_branch === "main" &&
        run.event === "push" &&
        run.path === ".github/workflows/ci.yml" &&
        run.repository.full_name === repository,
    )
    .toSorted((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];
  if (!latest)
    return {
      state: "waiting",
      detail: "No main-branch CI run exists for the exact release commit yet.",
    };
  if (latest.status !== "completed")
    return { state: "waiting", detail: `CI is ${latest.status}: ${latest.html_url}` };
  if (latest.conclusion !== "success")
    return {
      state: "failed",
      detail: `Release blocked: CI concluded ${latest.conclusion}: ${latest.html_url}`,
    };
  return { state: "passed", detail: `Exact release commit passed CI: ${latest.html_url}` };
}
