# Tom's Synara fork

This fork tracks Emanuele-web04/synara. The clean v0.8.10 rebuild starts from
upstream commit `a355cf2000b18aeb032e7dac18b74efdb3ab3268` and the native Auto
contribution `63e72c49171430ed6674b5dedf807842f3c98206`.

The maintained differences are:

- Native Auto mode for Devin and Grok, including capability checks and tests.
- Visible generic approval requests and session-scoped approval decisions.
- Windows/Linux release support for this fork's existing signing setup.
- A monotonically increasing fork release version and this maintenance note.

Scrolling, normal application behavior, dependency versions, and CI remain
upstream-owned. Experimental scroll patches and the custom exact-CI release
gate are not included in this rebuild.

## Updating from upstream

Fetch upstream and prepare a feature branch for the update. Merge the new
upstream changes, preserving the small patch set above and choosing a fork
version newer than every previously published or tagged fork version. Update
the four release package versions and their lockfile workspace entries without
upgrading unrelated dependencies.

Review the diff against upstream. Run Auto/approval regressions and release
smoke, build the app, and inspect CI before merging and tagging a release.
If upstream accepts one of these fixes, use its implementation and remove the
corresponding fork-only patch.

The desktop build uses `GITHUB_REPOSITORY` for its updater repository and keeps
the `synara` update channel. Releases from `tomkshaw-gif/synara` update this fork;
official upstream releases require an upstream merge and a new fork build to
retain Auto mode. npm publishing and automated release finalization stay opt-in.

Existing checkouts and Git history are retained. This rebuild does not delete
application data, provider credentials, or conversation history.
