import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { db } from "../db/index.js";
import { attendance, dens, events, guilds, scouts, signups } from "../db/schema.js";
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from "../lib/calendar.js";
import { hasLeaderRole } from "../lib/guild-config.js";
import { toUtcDate } from "../lib/timezone.js";
import { buildAuthorizeUrl, exchangeCodeForIdentity, fetchAllGuildMembers, fetchGuildMember } from "./auth.js";
import { webEnv } from "./env.js";
import { getLastBackupInfo, getPiVitals, getRecentErrors, getServiceStatus, restartService } from "./status.js";
import { escapeHtml, renderMain, renderNav, renderPage } from "./views.js";

interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  isLeader: boolean;
  isOwner: boolean;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    csrfToken?: string;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../../public");

const lastBackupMarkerPath = path.join(__dirname, "../../.last-backup-success");

const app = express();
app.set("trust proxy", 1);
app.use(express.static(publicDir));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: webEnv.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }),
);

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.redirect("/auth/login");
    return;
  }
  next();
}

function requireLeader(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user?.isLeader) {
    res.status(403).send(renderPage("Forbidden", renderMain("<h1>Forbidden</h1><p>Leaders only.</p>")));
    return;
  }
  next();
}

function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user?.isOwner) {
    res.status(403).send(renderPage("Forbidden", renderMain("<h1>Forbidden</h1><p>Not authorized.</p>")));
    return;
  }
  next();
}

app.get("/", (req: Request, res: Response) => {
  if (req.session.user) {
    res.redirect("/me");
    return;
  }
  res.send(
    renderPage(
      "ScoutBot",
      renderMain('<h1>Welcome</h1><p><a class="btn" href="/auth/login">Log in with Discord</a></p>'),
    ),
  );
});

app.get("/auth/login", (_req: Request, res: Response) => {
  res.redirect(buildAuthorizeUrl());
});

app.get("/auth/callback", async (req: Request, res: Response) => {
  const code = req.query.code;
  if (typeof code !== "string") {
    res.status(400).send("Missing code");
    return;
  }

  try {
    const identity = await exchangeCodeForIdentity(code);
    const member = await fetchGuildMember(identity.id);
    if (!member) {
      res
        .status(403)
        .send(
          renderPage(
            "Not a member",
            renderMain("<h1>Not a member</h1><p>You're not a member of this pack's Discord server.</p>"),
          ),
        );
      return;
    }

    const config = await db.query.guilds.findFirst({ where: eq(guilds.id, webEnv.webGuildId) });
    const isLeader = config ? hasLeaderRole(member.roleIds, config) : false;
    const isOwner = webEnv.ownerDiscordId !== undefined && identity.id === webEnv.ownerDiscordId;

    req.session.user = {
      id: identity.id,
      username: identity.username,
      displayName: member.displayName,
      isLeader,
      isOwner,
    };
    res.redirect("/me");
  } catch (error) {
    console.error("OAuth callback failed:", error);
    res
      .status(500)
      .send(
        renderPage("Error", renderMain("<h1>Error</h1><p>Something went wrong logging you in. Try again.</p>")),
      );
  }
});

app.get("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const nav = renderNav(user);

  const myScouts = await db.query.scouts.findMany({
    where: and(eq(scouts.guildId, webEnv.webGuildId), eq(scouts.parentDiscordId, user.id)),
  });

  if (myScouts.length === 0) {
    res.send(
      renderPage(
        "My scouts",
        nav +
          renderMain(
            "<h1>My Scouts</h1><p>No scouts registered to you yet. Use <code>/signup register</code> in Discord.</p>",
          ),
      ),
    );
    return;
  }

  const denRows = await db.query.dens.findMany({ where: eq(dens.guildId, webEnv.webGuildId) });
  const denById = new Map(denRows.map((den) => [den.id, den.name]));

  const scoutIds = myScouts.map((scout) => scout.id);
  const mySignups = await db.query.signups.findMany({ where: inArray(signups.scoutId, scoutIds) });
  const eventIds = [...new Set(mySignups.map((signup) => signup.eventId))];
  const eventRows =
    eventIds.length > 0 ? await db.query.events.findMany({ where: inArray(events.id, eventIds) }) : [];
  const eventById = new Map(eventRows.map((event) => [event.id, event]));

  const config = await db.query.guilds.findFirst({ where: eq(guilds.id, webEnv.webGuildId) });

  const sections = myScouts.map((scout) => {
    const denName = denById.get(scout.denId) ?? "Unknown den";
    const rows = mySignups
      .filter((signup) => signup.scoutId === scout.id)
      .map((signup) => eventById.get(signup.eventId))
      .filter((event): event is NonNullable<typeof event> => Boolean(event))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((event) => {
        const status = event.status === "cancelled" ? ' <span class="cancelled">(cancelled)</span>' : "";
        let calendarCell = "";
        if (config) {
          const start = toUtcDate(event.date, event.startTime, config.timezone);
          const end = toUtcDate(event.date, event.endTime, config.timezone);
          const info = { title: event.title, location: event.location, details: event.details, start, end };
          calendarCell = `<a href="${buildGoogleCalendarUrl(info)}">Google</a> · <a href="${buildOutlookCalendarUrl(info)}">Outlook</a>`;
        }
        return `<tr><td>${escapeHtml(event.title)}${status}</td><td>${event.date} ${event.startTime}–${event.endTime}</td><td>${escapeHtml(event.location)}</td><td>${calendarCell}</td></tr>`;
      })
      .join("");

    return `<div class="card">
      <h2>${escapeHtml(scout.firstName)} ${escapeHtml(scout.lastInitial)}. — ${escapeHtml(denName)}</h2>
      <table><thead><tr><th>Event</th><th>When</th><th>Where</th><th>Calendar</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No signups yet.</td></tr>'}</tbody></table>
      </div>`;
  });

  res.send(renderPage("My scouts", nav + renderMain(`<h1>My Scouts</h1>${sections.join("\n")}`)));
});

app.get("/roster", requireAuth, requireLeader, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const nav = renderNav(user);

  const [scoutRows, denRows, memberNames] = await Promise.all([
    db.query.scouts.findMany({ where: eq(scouts.guildId, webEnv.webGuildId) }),
    db.query.dens.findMany({ where: eq(dens.guildId, webEnv.webGuildId) }),
    fetchAllGuildMembers(),
  ]);
  const denById = new Map(denRows.map((den) => [den.id, den.name]));

  const rosterRows = scoutRows
    .sort((a, b) => a.lastInitial.localeCompare(b.lastInitial) || a.firstName.localeCompare(b.firstName))
    .map((scout) => {
      const parentName = memberNames.get(scout.parentDiscordId) ?? scout.parentDiscordId;
      const denName = denById.get(scout.denId) ?? "Unknown den";
      return `<tr><td>${escapeHtml(scout.firstName)} ${escapeHtml(scout.lastInitial)}.</td><td>${escapeHtml(denName)}</td><td>${escapeHtml(parentName)}</td></tr>`;
    })
    .join("");

  const eventRows = await db.query.events.findMany({
    where: eq(events.guildId, webEnv.webGuildId),
    orderBy: desc(events.date),
  });
  const eventIds = eventRows.map((event) => event.id);
  const [allSignups, allAttendance] = await Promise.all([
    eventIds.length > 0 ? db.query.signups.findMany({ where: inArray(signups.eventId, eventIds) }) : [],
    eventIds.length > 0 ? db.query.attendance.findMany({ where: inArray(attendance.eventId, eventIds) }) : [],
  ]);
  const scoutById = new Map(scoutRows.map((scout) => [scout.id, scout]));

  const eventSections = eventRows.map((event) => {
    const signedUp = allSignups
      .filter((signup) => signup.eventId === event.id)
      .map((signup) => scoutById.get(signup.scoutId))
      .filter((scout): scout is NonNullable<typeof scout> => Boolean(scout));
    const attended = allAttendance
      .filter((record) => record.eventId === event.id)
      .map((record) => scoutById.get(record.scoutId))
      .filter((scout): scout is NonNullable<typeof scout> => Boolean(scout));
    const status = event.status === "cancelled" ? ' <span class="cancelled">(cancelled)</span>' : "";

    const nameList = (list: typeof signedUp) =>
      list.map((scout) => escapeHtml(`${scout.firstName} ${scout.lastInitial}.`)).join(", ") ||
      '<span class="muted">none</span>';

    return `<div class="card">
      <h3>${escapeHtml(event.title)}${status} — ${event.date}</h3>
      <p><strong>Signed up (${signedUp.length}):</strong> ${nameList(signedUp)}</p>
      <p><strong>Attended (${attended.length}):</strong> ${nameList(attended)}</p>
      </div>`;
  });

  const body = `<h1>Roster</h1>
    <div class="card">
    <h2>Scouts (${scoutRows.length})</h2>
    <table><thead><tr><th>Scout</th><th>Den</th><th>Parent</th></tr></thead><tbody>${rosterRows}</tbody></table>
    </div>
    <h2>Events</h2>${eventSections.join("\n")}`;

  res.send(renderPage("Roster", nav + renderMain(body)));
});

app.get("/health", requireAuth, requireOwner, async (req: Request, res: Response) => {
  const user = req.session.user!;
  const nav = renderNav(user);

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }

  const [botStatus, webStatus, vitals, botErrors, backupInfo] = await Promise.all([
    getServiceStatus("scoutbot.service"),
    getServiceStatus("scoutbot-web.service"),
    getPiVitals(),
    getRecentErrors("scoutbot.service"),
    getLastBackupInfo(lastBackupMarkerPath),
  ]);

  const badge = (status: { active: boolean; state: string; since: string | null }) =>
    `<span class="${status.active ? "status-ok" : "status-bad"}">${escapeHtml(status.state)}</span>${
      status.since ? ` <span class="muted">since ${escapeHtml(status.since)}</span>` : ""
    }`;

  let banner = "";
  if (req.query.restarted === "1") {
    banner = '<p class="status-ok">Restart requested — give it a few seconds to reconnect.</p>';
  } else if (req.query.restart_failed === "1") {
    banner = '<p class="status-bad">Restart failed — check the Pi directly over SSH.</p>';
  }

  const body = `<h1>Status</h1>
    ${banner}
    <div class="card">
      <h2>Bot</h2>
      <p>${badge(botStatus)}</p>
      <form method="post" action="/health/restart-bot" onsubmit="return confirm('Restart the ScoutBot Discord bot now? It will be briefly offline.');">
        <input type="hidden" name="csrfToken" value="${escapeHtml(req.session.csrfToken)}">
        <button class="btn" type="submit">Restart bot</button>
      </form>
    </div>
    <div class="card">
      <h2>Web portal</h2>
      <p>${badge(webStatus)}</p>
      <p class="muted">No restart button here — if this were down, this page wouldn't be reachable anyway.</p>
    </div>
    <div class="card">
      <h2>Pi vitals</h2>
      <pre>${escapeHtml(vitals)}</pre>
    </div>
    <div class="card">
      <h2>Bot errors (last 24h)</h2>
      <pre>${escapeHtml(botErrors)}</pre>
    </div>
    <div class="card">
      <h2>Last DB backup</h2>
      <p>${escapeHtml(backupInfo)}</p>
    </div>`;

  res.send(renderPage("Status", nav + renderMain(body)));
});

app.post("/health/restart-bot", requireAuth, requireOwner, async (req: Request, res: Response) => {
  if (req.body.csrfToken !== req.session.csrfToken) {
    res.status(403).send(renderPage("Forbidden", renderMain("<h1>Forbidden</h1><p>Invalid form token, go back and retry.</p>")));
    return;
  }
  try {
    await restartService("scoutbot.service");
    res.redirect("/health?restarted=1");
  } catch (error) {
    console.error("Failed to restart bot:", error);
    res.redirect("/health?restart_failed=1");
  }
});

app.listen(webEnv.webPort, () => {
  console.log(`ScoutBot web portal listening on http://localhost:${webEnv.webPort}`);
});
