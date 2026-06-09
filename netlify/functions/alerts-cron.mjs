// Scheduled daily trigger for the disaster-alert engine.
// Runs server-side (holds no public surface for sending) and calls runAlerts()
// directly, so the public disaster-alerts endpoint can stay locked behind the key.
// Schedule: 13:00 UTC daily (~8–9am US Eastern). Change the cron below to adjust.

import { runAlerts } from "./disaster-alerts.mjs";

export const config = { schedule: "0 13 * * *" };

export default async () => {
  const summary = await runAlerts({ dryRun: false });
  console.log("alerts-cron:", JSON.stringify(summary));
  return new Response("ok");
};
