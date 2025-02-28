import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { TagService } from "../services/tag.service";

const router = new Hono();

const createTagSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

router.get("/", async (c) => {
  const tags = await TagService.getAllTags();
  return c.json(tags);
});

router.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tag = await TagService.getTagBySlug(slug);

  if (!tag) {
    return c.json({ error: "Tag not found" }, 404);
  }

  return c.json(tag);
});

router.post("/", zValidator("json", createTagSchema), async (c) => {
  const data = await c.req.json();
  const result = await TagService.createTag(data);
  return c.json(result, 201);
});

router.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  await TagService.deleteTag(slug);
  return c.json({ success: true });
});

export { router as tagRoutes };
