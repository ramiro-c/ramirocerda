---
title: "Types of RAG, and why Botardo moved to adaptive"
description: "From the RAG that always searches to the one that first decides whether it needs to. A short tour of the common variants and how Botardo's pipeline ended up."
pubDate: 2026-11-02
lang: "en"
draft: false
relatedProjects: ["botardo"]
---

RAG (retrieval-augmented generation) means giving the model information it doesn't have before it answers: you search your knowledge base, pass along what you found, and it answers with that. The idea is simple, but there are several ways to build it.

## The common variants

**Linear (or naive) RAG.** Every question becomes an embedding, the most similar chunks are retrieved and the model answers with them. Same steps no matter what you ask. It's what everyone builds first, and it was Botardo's first version.

**RAG with reranking.** Same as linear, but after the vector search a second model (a cross-encoder) reorders the results by looking at the question and each chunk together. The search brings candidates fast and the reranker picks which ones actually help.

**Hybrid RAG.** Combines vector search with keyword search (BM25 style). Useful when there are proper names, acronyms or codes that embeddings don't capture well.

**Corrective RAG.** After retrieving, something checks whether what came back is enough. If it isn't, it corrects: rewrites the query, searches again or searches elsewhere. That's the idea behind Corrective RAG (see Further reading).

**Self-RAG.** The model itself decides when to retrieve and critiques its own output while generating (see Self-RAG in Further reading).

**Adaptive RAG.** Before searching, it picks a strategy based on the question: don't search, search once, or search in several steps. The name comes from Adaptive-RAG (see Further reading), which uses a question-complexity classifier to choose.

**Agentic RAG.** An agent has search as a tool and decides on its own when, where and how many times to use it, in a loop.

## Where Botardo ended up

Botardo started linear: every message was searched in the index, even a "hi". That had two problems. Searching for a greeting is wasted work, and when the search didn't bring the right thing, the model answered anyway with whatever was there.

Now it's adaptive with a corrective step:

1. A router with a small decision model classifies each message as search, smalltalk or off-topic. It also decides whether the conversation history is needed and whether the visitor wants to get in touch.
2. Smalltalk and off-topic get an answer without searching.
3. For search, it retrieves chunks from Vectorize and reorders them with a reranker.
4. A judge checks whether those chunks are enough to answer. If not, it runs a second search with the question rewritten using the context, merges the results and checks again.
5. Only then it generates the answer, streamed.
6. If no chunks clear the similarity threshold, it replies that it doesn't have that info, without generating.

It isn't hybrid: the base is prose (profile and notes), where embeddings capture similarity well. There are no codes or acronyms that break dense retrieval; if there were, that's where BM25 would earn its place.

So the decision doesn't add waiting time, retrieval starts in parallel with the router. If the router says it wasn't needed, that result is dropped.

## How I know it decides well

I measured it with a set of eval cases against the production router: it got whether to search right in every case, the message classification in every case, and caught contact intent in all but one. The decision takes around 120 ms at the median.

## Further reading

- [Corrective RAG](https://arxiv.org/abs/2401.15884) — check what came back and correct if it isn't enough.
- [Self-RAG](https://arxiv.org/abs/2310.11511) — the model decides when to retrieve and critiques its own output.
- [Adaptive-RAG](https://arxiv.org/abs/2403.14403) — a question-complexity classifier that picks the strategy.

Try it at [Botardo](/en/), bottom right.
