import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware } from "../middleware/authMiddleware";
import { PostService } from "../services/post.service";

const router = new Hono<{ Variables: { userId: number } }>();

const createPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  slug: z.string().min(1),
  published: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const updatePostSchema = createPostSchema.partial();

// Rutas públicas
router.get("/", async (c) => {
  const posts = await PostService.getAllPosts();
  return c.json(posts);
});

router.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const post = await PostService.getPostBySlug(slug);

  if (!post) {
    return c.json({ error: "Post not found" }, 404);
  }

  return c.json(post);
});

// Rutas protegidas
router.use("/*", authMiddleware());

router.post("/", zValidator("json", createPostSchema), async (c) => {
  const data = await c.req.json<z.infer<typeof createPostSchema>>();
  const { tags = [], ...postData } = data;
  const userId = c.get("userId");

  try {
    const result = await PostService.createPost(
      {
        ...postData,
        authorId: userId,
      },
      tags
    );
    return c.json(result, 201);
  } catch (error: any) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to create post",
      },
      400
    );
  }
});

router.put("/:slug", zValidator("json", updatePostSchema), async (c) => {
  const slug = c.req.param("slug");
  const data = await c.req.json<z.infer<typeof updatePostSchema>>();
  const { tags, ...postData } = data;
  const userId = c.get("userId");

  try {
    const post = await PostService.getPostBySlug(slug);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Verificar que el usuario es el autor del post
    if (post.authorId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const result = await PostService.updatePost(
      slug,
      { ...postData, authorId: userId },
      tags
    );

    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to update post",
      },
      400
    );
  }
});

router.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const userId = c.get("userId");

  try {
    const post = await PostService.getPostBySlug(slug);

    if (!post) {
      return c.json({ error: "Post not found" }, 404);
    }

    // Verificar que el usuario es el autor del post
    if (post.authorId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    await PostService.deletePost(slug);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete post",
      },
      400
    );
  }
});

export { router as postRoutes };
