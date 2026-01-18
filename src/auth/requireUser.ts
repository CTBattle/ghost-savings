import { FastifyReply, FastifyRequest } from "fastify";
import { verifyIdToken } from "./firebase.js";


declare module "fastify" {
  interface FastifyRequest {
    user?: { uid: string; email?: string | null };
  }
}

function isDev() {
  return process.env.NODE_ENV !== "production";
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (isDev()) {
    const devUser = req.headers["x-user-id"];
    if (typeof devUser === "string" && devUser.trim()) {
      req.user = { uid: devUser.trim() };
      return;
    }
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing Authorization Bearer token" });
  }

  const token = auth.slice("Bearer ".length).trim();

  try {
    const decoded = await verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return reply.code(401).send({ error: "Invalid or expired ID token" });
  }
}
