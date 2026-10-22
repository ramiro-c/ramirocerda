---
title: "Testing agents without an LLM judge"
description: "A deterministic eval harness for agents: golden cases, verifiable graders, and a pass-rate threshold that fails CI. Why an LLM judge should not be the first move."
pubDate: 2026-10-22
lang: "en"
draft: false
relatedProjects: ["spec-refinery", "rag-citation-agent"]
---

Testing an agent is weird. A normal test verifies a function: input, output, done. An agent decides at runtime which tool to call, with which arguments, and what to say back. If you test it by the text it returns, every model change breaks the suite and every real bug hides inside a snapshot nobody reads.

There is a known escape hatch: an LLM "judge" that scores the answer. It is flexible, but it has three problems that pushed me to look for something else. It is not deterministic (the same input scores differently depending on the day). It is not cheap (you pay a call per case, per iteration). And it is not diagnosable (when it fails it does not tell you WHAT broke: a tool called wrong, a number invented, or the wrong language).

## The alternative: golden cases and deterministic graders

The idea is to separate the two things the judge mixes together. First, the case: an input, the context the agent has access to, the tools it may use, and what is actually expected.

```yaml
id: invoice-total
input: "How much did I spend on hosting in March?"
context:
  - "Hosting March 2026: USD 42.50 (invoice 0031)"
tools_available: [kb_search, calculator]
expect:
  tools_called:
    - name: kb_search
      args: { query: "hosting March 2026" }
    - name: calculator
      args: { expression: "42.50" }
  numeric_claims:
    - value: 42.50
      must_appear_in_context: true
  forbidden_content: ["I cannot see your invoices"]
  language: en
```

Second, the grader: every rule is a program that receives the conversation and the case, and returns pass/fail with a reason. No model in the middle.

The graders worth having when the agent has tools:

- **Tools**: it used the tools it should have used, and not the ones it should not have. Arguments matter too: calling `calculator` with `42.50` instead of `"42.50"` is a real bug, not a style detail.
- **Numeric grounding**: every number the agent states has to appear in the context. It says 42.50 and the context says 42.50, it passes. It says 4250, it fails. This kills numeric hallucinations, the expensive kind, because nobody notices them until Billing.
- **Factual grounding**: every claim attributable to a source has to carry its citation. It is not "the answer is correct", it is "the answer cites what it says".
- **Forbidden content**: phrases the agent must never say ("as an AI I can't...", "I don't have access to your data", promising what it cannot deliver).
- **Language**: the answer has to be in the language the user wrote in, detected with stopwords, without asking a model anything.

Then the runner executes every case, computes the pass rate, and exits with a non-zero code when it drops below the threshold. That is what makes it usable in CI: it is not a script someone runs by hand, it is a gate.

## Where this does NOT reach

I am not selling smoke: deterministic evals verify facts, calls, and limits. They do not verify whether the answer is *good*.

- Did it actually help the user? Is it clear? Is the tone right? → subjective, and an LLM judge (or a person) is still the only reasonable tool.
- Did the agent take the most efficient path? That is a cost and latency problem, not a correctness one.

My rule: the LLM judge only enters where graders cannot reach, and it runs over a small subset, not the whole suite. If the judge is the only thing evaluating, you do not have tests: you have opinions with latency.

## The asset

I left it in [ramiro-c/agent-evals](https://github.com/ramiro-c/agent-evals): the package, the graders, the runner, the tests, and a synthetic support-agent example with one case per failure mode. It is framework-agnostic and stdlib-only, so it drops into any pipeline without touching the environment.

One caveat: the harness I run in production lives in a private repo. What is public is the method and a toy example, not the production code. If the idea is useful to you, copy the case format.

Closing thought: agents should not be tested with mocks, they should be tested against contracts. A snapshot tells you something changed; a golden case tells you what broke.
