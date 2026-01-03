import Fastify from "fastify";

const app = Fastify({ logger: true });

// Health check
app.get("/health", async () => {
  return { ok: true, service: "ghost-savings", ts: new Date().toISOString() };
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

