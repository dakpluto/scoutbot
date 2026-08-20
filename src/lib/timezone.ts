import { DateTime } from "luxon";

/**
 * Combines a `YYYY-MM-DD` date and `HH:MM` time (already validated) with an
 * IANA timezone into a UTC JS Date, for handing to Discord's Scheduled
 * Event API (which wants absolute timestamps, not wall-clock strings).
 */
export function toUtcDate(date: string, time: string, timezone: string): Date {
  const dt = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", { zone: timezone });
  return dt.toJSDate();
}
