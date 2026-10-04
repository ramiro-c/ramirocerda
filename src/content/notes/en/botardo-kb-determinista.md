---
title: "Determinism for the win"
description: "Botardo, the chatbot on my site, has a RAG over my experience and projects. I used to reindex by hand or ask an agent. Now a CI script does it when the content changes."
pubDate: 2026-10-04
lang: "en"
draft: false
---

Botardo, the chatbot on my site, has a RAG with my experience and projects.

Every time I changed the content I had to reindex by hand, or tell an agent to do it. Sometimes it didn't. Sometimes I forgot.

I was handling it with skills. What I did was look for another way and make it deterministic. After going back and forth with my friend Claudito, the best option was a script in CI: if the content changes, it reindexes.

No LLMs in that step. Nothing to remember. 100% deterministic.
