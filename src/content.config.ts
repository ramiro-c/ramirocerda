import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const localized = z.object({
  title: z.string(),
  summary: z.string(),
  problem: z.string(),
  what: z.string(),
  highlights: z.array(z.string()).default([]),
  stack: z.array(z.string()),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    slug: z.string(),
    kind: z.enum(["personal", "freelance", "oss-fork"]).optional(),
    // The only status label is `live`: the project is reachable at a public URL
    // (deployed and working). Projects without a public URL carry no status.
    status: z.literal("live").optional(),
    year: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number(),
    tags: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    es: localized,
    en: localized,
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    lang: z.enum(["es", "en"]),
    slug: z.string().optional(),
    draft: z.boolean().default(false),
    relatedProjects: z.array(z.string()).default([]),
  }),
});

export const collections = { projects, notes };
