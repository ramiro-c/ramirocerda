import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { generateToken } from "../utils/jwt";
import { comparePassword, hashPassword } from "../utils/password";

export class AuthService {
  static async login(email: string, password: string) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValid = await comparePassword(password, user.password);

    if (!isValid) {
      throw new Error("Invalid credentials");
    }

    const token = generateToken({ userId: user.id });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  static async register(data: {
    email: string;
    password: string;
    name: string;
  }) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .get();

    if (existingUser) {
      throw new Error("Email already in use");
    }

    const hashedPassword = await hashPassword(data.password);

    const [user] = await db
      .insert(users)
      .values({
        ...data,
        password: hashedPassword,
      })
      .returning()
      .all();

    const token = generateToken({ userId: user.id });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  static async logout(token: string) {
    // Aquí podrías implementar una lista negra de tokens si lo deseas
    return true;
  }
}
