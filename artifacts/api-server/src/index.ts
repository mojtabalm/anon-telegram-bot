import app from "./app";
import { logger } from "./lib/logger";
import { setupWebhook } from "./bot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  setupWebhook().catch((e) => logger.error({ e }, "Webhook setup failed"));

  // Keep-alive: ping self every 4 minutes so Replit doesn't sleep
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const selfUrl = `https://${domains.split(",")[0]}/api/healthz`;
    setInterval(() => {
      fetch(selfUrl).catch(() => {});
    }, 4 * 60 * 1000);
    logger.info({ selfUrl }, "Keep-alive ping started");
  }
});
