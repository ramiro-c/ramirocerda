import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { authRoutes } from "./routes/auth";
import { postRoutes } from "./routes/post";
import { tagRoutes } from "./routes/tag";

const app = new Hono();

// Middlewares
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ status: "ok" }));

// Routes
app.route("/api/posts", postRoutes);
app.route("/api/tags", tagRoutes);
app.route("/api/auth", authRoutes);

const port = process.env.PORT ?? 3001;

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: Number(port),
});
