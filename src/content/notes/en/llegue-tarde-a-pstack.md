---
title: "I arrived late to pstack"
description: "Lauren Tan's Cursor plugin is the most polished agent workflow I've tried. I use /how, /architect and /poteto-mode, with a more token-friendly model mix than the default."
pubDate: 2026-11-18
lang: "en"
draft: false
---

I arrived late to pstack, Lauren Tan's (poteto) Cursor plugin, and I really liked it. It's the most polished workflow I've tried for working with agents.

It landed in the marketplace with [cursor/plugins PR #73](https://github.com/cursor/plugins/pull/73), merged on 23 May 2026. Today it's on v0.15.43: 22 playbooks and 24 principles.

The three skills I use:

- `/how` to understand the code as it is, before touching it. Since v0.15.43 it launches a read-only subagent; I invoke it by hand with `/how`.
- `/architect` to lock types and structure before writing.
- `/poteto-mode` to execute with a check that either passes or fails.

I never even ran it with the default models: on the 20 USD subscription it just wasn't viable. I use a more token-friendly mix, configured with `/setup-pstack`.

In my cards loop it replaced SDD. The flow is on the [workflow](/en/workflow/) page.

## Further reading

- [pstack in cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)
- [v0.15.43 change](https://github.com/cursor/plugins/commit/2f87c854fe3e2fcda44ca86b46ede35aad3c46b7)
