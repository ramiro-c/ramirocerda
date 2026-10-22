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

```json
{
  "id": "refund-status",
  "prompt": "What is the status of my refund?",
  "expected_tools": ["kb_search"],
  "expected_tool_args": { "kb_search": { "query": "refund status" } },
  "expected_numbers": ["1234"],
  "expected_facts": ["refund 1234 was approved"],
  "forbidden_phrases": ["as an AI I cannot"],
  "expected_language": "en"
}
```

The recorded turns (the transcript, with every tool call and its result) live in the same case. That lets the suite run in replay mode: it grades the recorded transcript without calling the agent, the model, or the network.

Second, the grader: every rule is a program that receives the conversation and the case, and returns pass/fail with a reason. No model in the middle.

The six graders in the harness:

- **`tool_usage`**: it called every tool in `expected_tools` and none of the ones in `forbidden_tools`. Deleting an account or firing an escalation email when it should have searched the knowledge base is a real bug, not a style choice.
- **`tool_args`**: each tool can declare the subset of arguments it must have been called with; if no call matches, it fails.
- **`numeric_grounding`**: every number the agent states has to appear in some tool call's result, and every number the case demands has to appear in the response. When it fails it names the offending number: the KB says 1234, the agent answered 9999.
- **`fact_grounding`**: the expected claim has to appear in the response AND be backed by a tool call result. It is not "the answer is correct", it is "the answer cites what it says".
- **`no_forbidden_content`**: phrases the agent must never say ("as an AI I cannot...", promising what it cannot deliver). Matching ignores case, accents, and punctuation.
- **`language`**: the answer has to be in the language the user wrote in, detected with stopwords, without asking a model anything.

Then the CLI runs every case, prints a table with the exact reason each one failed, computes the pass rate, and exits non-zero when it drops below the threshold:

```bash
PYTHONPATH=src python3 -m agent_evals.cli cases.json --threshold 1.0
```

`--report` writes the same verdicts as a JSON artifact for CI to keep. That is what makes it usable in CI: it is not a script someone runs by hand, it is a gate.

## Where this does NOT reach

I am not selling smoke: deterministic evals verify facts, calls, and limits. They do not verify whether the answer is *good*.

- Did it actually help the user? Is it clear? Is the tone right? → subjective, and an LLM judge (or a person) is still the only reasonable tool.
- Did the agent take the most efficient path? That is a cost and latency problem, not a correctness one.

My rule: the LLM judge only enters where graders cannot reach, and it runs over a small subset, not the whole suite. If the judge is the only thing evaluating, you do not have tests: you have opinions with latency.

## The asset

I left it in [ramiro-c/agent-evals](https://github.com/ramiro-c/agent-evals): the package, the graders, the runner, the tests, and a synthetic support-agent example with one case per failure mode. It is framework-agnostic and stdlib-only, so it drops into any pipeline without touching the environment.

One caveat: the harness I run in production lives in a private repo. What is public is the method and a toy example, not the production code. If the idea is useful to you, copy the case format.

Closing thought: agents should not be tested with mocks, they should be tested against contracts. A snapshot tells you something changed; a golden case tells you what broke.
