import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Generate daily alerts every day at 8am UTC (5am BRT)
crons.daily(
  "generate daily notifications",
  { hourUTC: 8, minuteUTC: 0 },
  internal.notifications.generateDailyAlerts,
);

export default crons;
