import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = await getCollection("blog");
  const title = import.meta.env.PUBLIC_BLOG_TITLE;
  const description = import.meta.env.PUBLIC_BLOG_TITLE;

  return rss({
    title: title,
    description: description,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/posts/${post.id}/`,
    })),
    customData: `<language>es-ES</language>`,
  });
}
