import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { db } from "../db";
import { tags } from "../db/schema";

const insertTagSchema = createInsertSchema(tags);
const selectTagSchema = createSelectSchema(tags);

export type Tag = z.infer<typeof selectTagSchema>;
export type NewTag = z.infer<typeof insertTagSchema>;

export class TagService {
  static async getAllTags() {
    return await db.select().from(tags).all();
  }

  static async getTagBySlug(slug: string) {
    return await db.select().from(tags).where(eq(tags.slug, slug)).get();
  }

  static async createTag(tag: NewTag) {
    return await db.insert(tags).values(tag).run();
  }

  static async deleteTag(slug: string) {
    return await db.delete(tags).where(eq(tags.slug, slug)).run();
  }
}
