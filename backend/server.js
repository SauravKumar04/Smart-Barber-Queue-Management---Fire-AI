import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config/env.js";
import { routes } from "./routes/api.js";
import { enforceOrigin, errorHandler, HttpError } from "./middleware/http.js";
import { Owner } from "./models/Owner.js";
import { QueueEntry } from "./models/QueueEntry.js";
import { Shop } from "./models/Shop.js";
import { startMailer } from "./utils/mailer.js";
import { configureQueueSessions } from "./utils/queue.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.proxyHops);
  app.use(
    helmet({
      referrerPolicy: { policy: "no-referrer" },
      strictTransportSecurity: config.secureCookies,
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: config.secureCookies ? [] : null,
        },
      },
    }),
  );
  app.use(
    "/api",
    (req, res, next) => {
      res.set("Cache-Control", "no-store");
      next();
    },
    enforceOrigin,
    express.json({ limit: "16kb" }),
    routes,
    () => {
      throw new HttpError(404, "API route not found.");
    },
  );

  const frontend = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
  if (existsSync(frontend + "index.html")) {
    app.use(express.static(frontend));
    app.get("/{*page}", (req, res) => res.sendFile(frontend + "index.html"));
  }

  app.use(errorHandler);
  return app;
}

export async function connectDatabase() {
  if (!config.mongoUri)
    throw new Error(
      "Set MONGO_URI in backend/.env or the process environment.",
    );
  if (!config.jwtSecret || Buffer.byteLength(config.jwtSecret) < 32) {
    throw new Error(
      "Set JWT_SECRET to at least 32 bytes in backend/.env or the process environment.",
    );
  }
  if (!Number.isInteger(config.proxyHops) || config.proxyHops < 0)
    throw new Error("Invalid TRUST_PROXY_HOPS");
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: true,
  });
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  const transactionsSupported = Boolean(topology.setName || topology.msg === "isdbgrid");
  if (config.production && !transactionsSupported) {
    throw new Error(
      "Production requires a MongoDB replica set or sharded cluster.",
    );
  }
  configureQueueSessions(transactionsSupported);
  await Promise.all([Owner.init(), Shop.init(), QueueEntry.init()]);
}

async function start() {
  await connectDatabase();
  const server = createApp().listen(config.port, () =>
    console.info(`QueueLess API listening on port ${server.address().port}`),
  );
  const stopMailer = startMailer();
  const stop = () => {
    stopMailer();
    server.close(() => void mongoose.disconnect());
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch(async (error) => {
    console.error("QueueLess could not start:", error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}
