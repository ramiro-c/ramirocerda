import { verifyToken } from "../utils/jwt"; // Asegúrate de que la ruta sea correcta

export function authMiddleware() {
  return async (c: any, next: any) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "No token provided" }, 401);
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token);

    if (!payload) {
      return c.json({ error: "Invalid token" }, 401);
    }

    // Agregar el userId al contexto de la request
    c.set("userId", payload.userId);

    await next();
  };
}
