export interface CalendarEventInfo {
  title: string;
  location: string;
  details: string | null;
  start: Date;
  end: Date;
}

function formatIcsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export function buildGoogleCalendarUrl(info: CalendarEventInfo): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: info.title,
    dates: `${formatIcsUtc(info.start)}/${formatIcsUtc(info.end)}`,
    location: info.location,
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(info: CalendarEventInfo): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: info.title,
    startdt: info.start.toISOString(),
    enddt: info.end.toISOString(),
    location: info.location,
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** RFC 5545 text escaping — backslashes, commas, semicolons, and newlines are structural in ICS. */
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/** A minimal single-event .ics file — Apple Calendar, Outlook desktop, and Google Calendar all accept this as an import/attachment. */
export function buildIcsContent(info: CalendarEventInfo, uid: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ScoutBot//Event//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(info.start)}`,
    `DTEND:${formatIcsUtc(info.end)}`,
    `SUMMARY:${escapeIcsText(info.title)}`,
    `LOCATION:${escapeIcsText(info.location)}`,
  ];
  if (info.details) lines.push(`DESCRIPTION:${escapeIcsText(info.details)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
