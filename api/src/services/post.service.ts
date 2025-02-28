import { eq, sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { db } from "../db";
import { posts, postsTags, tags } from "../db/schema";

const insertPostSchema = createInsertSchema(posts);
const selectPostSchema = createSelectSchema(posts);

export type Post = z.infer<typeof selectPostSchema>;
export type NewPost = z.infer<typeof insertPostSchema>;

export class PostService {
  static async getAllPosts() {
    const result = await db
      .select({
        post: posts,
        tags: tags,
      })
      .from(posts)
      .leftJoin(postsTags, eq(posts.id, postsTags.post_id))
      .leftJoin(tags, eq(postsTags.tag_id, tags.id))
      .all();

    const postsMap = new Map();
    result.forEach((row) => {
      if (!postsMap.has(row.post.id)) {
        postsMap.set(row.post.id, {
          ...row.post,
          tags: row.tags ? [row.tags] : [],
        });
      } else if (row.tags) {
        postsMap.get(row.post.id).tags.push(row.tags);
      }
    });

    return Array.from(postsMap.values());
  }

  static async getPostBySlug(slug: string) {
    const result = await db
      .select({
        post: posts,
        tags: tags,
      })
      .from(posts)
      .leftJoin(postsTags, eq(posts.id, postsTags.post_id))
      .leftJoin(tags, eq(postsTags.tag_id, tags.id))
      .where(eq(posts.slug, slug))
      .all();

    if (result.length === 0) return null;

    const post = result[0].post;
    const postTags = result.map((row) => row.tags).filter(Boolean);

    return {
      ...post,
      tags: postTags,
    };
  }

  static async createPost(post: NewPost, tagSlugs: string[] = []) {
    return await db.transaction(async (tx) => {
      const [newPost] = await tx.insert(posts).values(post).returning().all();

      if (tagSlugs.length > 0) {
        const existingTags = await tx
          .select()
          .from(tags)
          .where(sql`${tags.slug} IN (${tagSlugs.join(",")})`)
          .all();

        const postTagValues = existingTags.map((tag) => ({
          post_id: newPost.id,
          tag_id: tag.id,
        }));

        if (postTagValues.length > 0) {
          await tx.insert(postsTags).values(postTagValues).run();
        }
      }

      return {
        ...newPost,
        tags: tagSlugs,
      };
    });
  }

  static async updatePost(
    slug: string,
    postData: Partial<NewPost>,
    tagSlugs: string[] = []
  ) {
    return await db.transaction(async (tx) => {
      const [updatedPost] = await tx
        .update(posts)
        .set(postData)
        .where(eq(posts.slug, slug))
        .returning()
        .all();

      if (!updatedPost) return null;

      await tx
        .delete(postsTags)
        .where(eq(postsTags.post_id, updatedPost.id))
        .run();

      if (tagSlugs.length > 0) {
        const newTags = await tx
          .select()
          .from(tags)
          .where(sql`${tags.slug} IN (${tagSlugs.join(",")})`)
          .all();

        const postTagValues = newTags.map((tag) => ({
          post_id: updatedPost.id,
          tag_id: tag.id,
        }));

        if (postTagValues.length > 0) {
          await tx.insert(postsTags).values(postTagValues).run();
        }
      }

      return {
        ...updatedPost,
        tags: tagSlugs,
      };
    });
  }

  static async deletePost(slug: string) {
    return await db.delete(posts).where(eq(posts.slug, slug)).run();
  }
}
