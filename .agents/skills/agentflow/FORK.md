# Personal Agentflow fork

Based on upstream **9.1.0**, commit [`6c3537debc38e207da24ab6f25dcacbe98051541`](https://github.com/agfnow/agentflow/commit/6c3537debc38e207da24ab6f25dcacbe98051541), imported on 2026-10-29. Maintained in `xup60521/skills` for personal use. The upstream [license](LICENSE) and unchanged [release history](CHANGELOG.md) are included.

Install and update from this personal source:

```sh
bunx skills add xup60521/skills --skill agentflow
```

Upstream release checks are comparison notices only. Never replace personal ports with stock upstream files, push to agfnow or open an upstream PR without a separate explicit request. This collection's README and unrelated skills are outside the imported payload.

## Retained personal behavior

| Behavior | V9 location |
| --- | --- |
| T3 exact catalog selection, fresh briefs, handles, cancellation and resumed reviews | [T3 native work](references/t3.md), loaded by review rules |
| OpenCode provider/model, optional variant and attempt-bound results | `scripts/looper.js`, `scripts/looper-agent.js` |
| Nested `.env.local` and `.env.production` feature-worktree links | `scripts/feature.js`; existing targets preserved, Windows hard-link fallback, exact local ignores |
| Linux/Windows recoverable feature and looper cleanup | `scripts/recovery-bin.js`; same-volume moves, original-path metadata and identity checks; no permanent-delete fallback |
| Claude machine-local old-hook discovery | Legacy migration inspects `settings.local.json` alongside shared Claude settings and Codex hooks |
| Narrow ignores | Setup keeps shared `.claude/`, `.codex/` and skills trackable; no blanket host-directory ignores |
| PowerShell, literal argv, UTF-8/CRLF, path and descendant checks | V9 equivalents retained; editors use the same literal command resolver |
| Linux as a tested platform | Real-terminal, merge/cleanup journey and `--open` tests run on Linux as well as macOS; zsh cases skip when zsh is absent. A descendant that `ps` lists but that has provably exited before its `/proc` read is absent, not uncertain (`scripts/looper-agent.js`) |

OpenCode catalogs use strings such as `provider/model/variant`, split at the final slash. An explicit looper route is `{"kind":"cli","provider":"opencode","model-family":"my-catalog"}`. Variant `default` omits `--variant`; other safe provider variants pass literally. Unspecified tools, nested delegation and questions are denied; editing workers may edit/run commands, read-only reviewers may read/list/search, and task workers may read the installed skill directory (`external_directory`) to load SKILL.md. The final JSON text part is the attempt result; earlier narration and non-JSON transcript lines are ignored. A global OpenCode config with per-agent permissions may still apply. Tool permissions are not an OS sandbox. See [OpenCode CLI](https://opencode.ai/docs/cli/) and [permissions](https://opencode.ai/docs/permissions/). Fixture tests establish no live-provider or native Windows proof.

Linux recovery uses `${XDG_DATA_HOME:-~/.local/share}/Trash/files` with adjacent `info/*.trashinfo`. Windows uses `~/.agentflow-recovery/files` with original-path metadata. The Windows directory is recoverable storage, **not** the desktop Recycle Bin. Unsafe paths and cross-volume moves refuse: feature creation checks the volume before any change, so a repository on a different drive or volume from the home directory cannot use feature commands. Upstream v9 permanently deleted on Windows instead. Keep data and metadata together; restore to the recorded original path only when it is free. Restored worktrees need explicit Git-registration recovery. macOS retains upstream's Trash route. Native Windows validation remains outstanding.

Environment links cover only the two named files, never copied/printed bytes. Git, dependency and record directories, nested checkouts and source symlinks are skipped. Existing targets, including dangling links, stay unchanged. Link failures warn after successful preparation. Hard links share in-place writes but can diverge when an editor replaces a path atomically; this was also a v8 fallback limitation. Recreate only a confirmed stale link when needed.

## Migration boundaries

V9 deliberately removes ordinary v8 startup/writer/closeout helpers and Stop-hook enforcement. Old exported helper APIs are replaced by host procedures, feature commands and the group looper. No owned collection caller needs the removed APIs. Bootstrap review and notebook case/CRLF preservation remain host obligations. Schema 13 and the new feature commands/layout are intentional changes, not compatibility aliases for old queues or streams.

Finish active v8 queues/streams and reconcile native handles before [project migration](references/legacy-migration.md). Preserve history, owner settings and foreign hook entries. Check a known project-local `.opencode/plugins/agentflow.js` bridge before removing its old stop-hook dependency. This collection did not include that plugin implementation; the obsolete test referenced outside the self-contained skill. V9 captures owner messages through the host rather than reinstalling that absent bridge.

Existing global shell profiles and separately installed plugins are not replaced implicitly. Upgrade bindings explicitly through [setup](references/setup.md). Standard Node shims/native executables are supported; custom batch logic is not evaluated. Configure an explicit native executable or JS entrypoint for an unverifiable wrapper.

## Future upstream sync

Fetch a chosen upstream revision and compare its skill against the exact base above, then review the personal patch set separately. Copy upstream root license/changelog into the self-contained skill. Preserve this file, personal install source and relevant regression cases. Run `npm test` in the skill directory. Update the base after integration, checks and review; upstream release evidence does not validate personal patches.
