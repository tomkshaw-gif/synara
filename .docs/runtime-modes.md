# Runtime modes

Synara exposes three runtime modes in the permission picker:

- **Supervised**: asks the user before protected actions. Codex uses
  `approvalPolicy: untrusted`, `sandbox: read-only`, and
  `approvalsReviewer: user`. Claude Code uses its default permission mode.
- **Auto** (Codex, Claude Code, Devin, Grok): lets an AI reviewer handle routine
  approvals; higher-risk actions may be blocked or escalated to the user. Codex
  uses `approvalPolicy: on-request`, `sandbox: workspace-write`, and
  `approvalsReviewer: auto_review`. Claude Code uses `permissionMode: auto`
  without `allowDangerouslySkipPermissions`. Devin uses its Smart session mode
  (`session/set_config_option` `mode=smart`), which auto-approves actions the
  model judges safe and still sends `session/request_permission` for the rest.
  Grok spawns with `--permission-mode auto`, enabling its built-in action
  classifier. Grok's classifier never escalates hard-wait actions (production
  mutations, remote shells) to an approval card in headless ACP sessions — it
  denies them outright — so Synara annotates those tool failures with the Full
  access remedy instead of leaving a dead-end error.
- **Full access** (default): bypasses interactive approval. Codex uses
  `approvalPolicy: never`, `sandbox: danger-full-access`, and
  `approvalsReviewer: user`. Claude Code uses
  `permissionMode: bypassPermissions` with
  `allowDangerouslySkipPermissions: true`. Devin uses its Bypass Permissions
  session mode. Grok spawns with `--permission-mode bypassPermissions` (plus
  `--always-approve`) because Grok's hard-wait classifier still denies
  production-class actions under `default` in headless ACP sessions.

The reviewer is sent explicitly on every Codex thread start, resume, fork, and
turn so switching away from Auto cannot inherit a sticky auto-review setting.
Auto is only offered for providers with a native AI-review implementation.
Codex Auto requires CLI `0.131.0-alpha.9` or newer.
Claude Code Auto requires CLI `2.1.83` or newer and a model/account where the
SDK reports Auto support.
