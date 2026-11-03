# Agent instructions

At session start, the owner-facing host must load and follow agentflow via supported skill discovery, honoring explicit owner opt-outs. If unavailable, report it; never assume paths or install it. Delegates follow assignments without activating agentflow.

Read agentflow's `references/project-rules.md` from the resolved skill or exact host-supplied text, then `.agentflow/rules.md` if present; unavailable baseline defers shared-record writes and invariant/review acceptance. Report the gap and continue independent authorized work. Reading rules does not activate agentflow.

If you need to open a PR, open as non-draft.

If you write the code, focus on simplicity and maintainability.

If you find a problem too hard, ask the user before dive into the rabbit hole.

Don't use opencode non-free model unless the user asks so.

Do not let GPT models make visual design decisions, including colors, layout, typography, spacing, imagery, and styling. GPT models may implement a design specified by the user or an approved design reference. If a visual design decision is needed, ask the user rather than choosing it or delegating it to another GPT model.
