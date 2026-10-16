---
title: "Factory engineering: building the system that builds the product"
description: "Zach Lloyd (Warp) argues software engineering is becoming factory engineering: the job shifts to building the system of agents that produces the product. What he proposes, and concrete ways to implement it."
pubDate: 2026-10-15
lang: "en"
draft: false
---

I watched Zach Lloyd's talk at the AI Engineer World's Fair and it stuck with me. The thesis, in his own words: *software engineering is becoming factory engineering: building the system of agents that builds the product*.

It's a shift of place. For decades the job was to write the product; what Lloyd proposes is that the job becomes **the factory that produces it**, and that the factory gets designed, measured, and improved like any other system.

This didn't appear out of nowhere in one talk. Warp has been building the arc for a couple of years: the 2.0 release in June 2025 turned the terminal into an environment for directing agents; in August 2026 they introduced **Warp Factories**, connecting requests, agents, execution environments, and human decisions into a managed workflow; and in April 2026 they open sourced the client under AGPL. With that factory they ship around **2,000 PRs a month**, with requests coming in from Slack, moving through Linear, getting implemented, and reaching QA.

## How it's built

Four things from the talk felt the most concrete to me:

**1. Triage first.** What decides whether a request goes straight to implementation or needs a spec first isn't its size, it's its ambiguity. A clear, well-scoped issue resolves on its own; the one with open decisions needs someone to decide them first. Lloyd draws a line between two kinds of specs: product specs (what behavior is expected) and technical specs (how the architecture and the code are shaped).

**2. Review and verification stay inside.** Shipping completes one pass, not the loop. What happens in production comes back as the input for the next one. The factory doesn't end at the merge.

**3. The skill loop.** This is the one I liked most. When a senior engineer corrects a comment left by the automated review, an observer agent uses that correction to rewrite the review skill. The human correction stops being a patch that dies in that pull request and becomes a permanent improvement to the system.

**4. Buying the infrastructure doesn't save you the work.** Lloyd separates the factory infrastructure (which can be shared or bought) from the work of making it useful for a specific product: fitting the skills, choosing the review points, holding the judgment. He also asks teams to measure shipped output against human time and token cost, rather than counting agents running.

## Ways to implement it

You don't need to buy a factory to try the approach. From smallest to largest:

**Triage by ambiguity, not by size.** The criterion isn't how much work it is, it's how much has to be decided.

**Write a spec only when it's needed.** Everything else goes straight to implementation.

**Keep every human correction.** When you fix an automated review, a prompt, or a missing test, that shouldn't die in that pull request. It's the raw material for the skill loop.

**Measure cost per PR.** Tokens plus human time per unit of output. Without it you can't tell whether you improved the workflow or just ran more agents.

**GitHub Actions + your tracker + a webhook are already a small version of this.** The webhook triggers, the tracker holds the state, the workflow executes. What you buy later is convenience, not the concept.

## The limits he draws himself

I liked that the talk doesn't sell total autonomy. Lloyd says his public factory is an implementation that works but is imperfect, that human review is still the bottleneck, and that an efficient factory producing software nobody wants has failed its purpose.

## The resources

- Full talk, 20 minutes — https://www.youtube.com/watch?v=tUPPVhBBcoM
- Edited transcript and key points — https://ai.engineer/talks/tUPPVhBBcoM-software-engineering-is-becoming-factory
- How Warp ships 2,000 PRs a month (Lenny's Newsletter) — https://www.lennysnewsletter.com/p/how-warp-ships-2000-prs-a-month-with
- Software factories (Latent Space) — https://www.latent.space/p/software-factories
- Warp Factories, the announcement — https://www.warp.dev/blog/open-infrastructure-for-building-a-software-factory
- The public factory, live — https://build.warp.dev/
- Lloyd's handbook on product-first engineering — https://thezbook.com/code-first-vs-product-first

I'm not measuring cost per PR anywhere yet. If you have it running, [tell me how you measure it](https://www.linkedin.com/in/cerdaramiro/).
