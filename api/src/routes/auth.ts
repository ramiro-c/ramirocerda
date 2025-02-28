import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { AuthService } from "../services/auth.service";

const router = new Hono();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

router.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = await c.req.json();

  try {
    const result = await AuthService.login(email, password);
    return c.json(result);
  } catch (error: any) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Authentication failed",
      },
      401
    );
  }
});

router.post("/register", zValidator("json", registerSchema), async (c) => {
  const data = await c.req.json();

  try {
    const result = await AuthService.register(data);
    return c.json(result, 201);
  } catch (error: any) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Registration failed",
      },
      400
    );
  }
});

router.post("/logout", async (c) => {
  const token = c.req.header("Authorization")?.split(" ")[1];

  if (!token) {
    return c.json({ error: "No token provided" }, 401);
  }

  try {
    await AuthService.logout(token);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Logout failed",
      },
      400
    );
  }
});

export { router as authRoutes };
