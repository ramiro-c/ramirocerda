---
title: "What the f#ck is an embedding?"
description: "I started reading AI Engineering and a concept stopped me: representing anything with 'little arrows' of many dimensions. I had only used it for words. Here's my attempt at explaining it simply."
pubDate: 2026-11-01
lang: "en"
draft: false
---

I started reading AI Engineering, by Chip Huyen. At one point she mentions companies that represent their users with embeddings. I found it super interesting because I had only applied it to words, never at that level. Spotify models each user as a sequence of embeddings that shifts with what they've been listening to ([they published it on their research blog](https://research.atspotify.com/2021/04/contextual-and-sequential-user-embeddings-for-music-recommendation)). Pinterest represents users and pins in the same vector space for the homefeed ([here's the post from their engineering team](https://medium.com/pinterest-engineering/evolving-pinterests-embedding-retrieval-platform-aede4e831e01)).

But the shift that clicked for me is that there's nothing special about words. It's wild how much you can do by representing anything with little arrows of many dimensions: you can match images with text searches, because a model learns to put them in the same space, and your query is just another vector that finds whatever is close. In the end, everything is an embedding.
