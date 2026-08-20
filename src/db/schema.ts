import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

/** Discord guild ID, not an autoincrement PK — one row per server the bot is configured for. */
export const guilds = sqliteTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  backupRepo: text("backup_repo"),
  /** Role allowed to record attendance, alongside packLeadershipRoleId. */
  denLeaderRoleId: text("den_leader_role_id"),
  /** Role allowed to record attendance, alongside denLeaderRoleId. */
  packLeadershipRoleId: text("pack_leadership_role_id"),
  ...timestamps,
});

export const dens = sqliteTable("dens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id),
  name: text("name").notNull(),
  discordRoleId: text("discord_role_id").notNull(),
  ...timestamps,
});

export const scouts = sqliteTable("scouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id),
  parentDiscordId: text("parent_discord_id").notNull(),
  firstName: text("first_name").notNull(),
  /** Privacy: last initial only, never a full surname. */
  lastInitial: text("last_initial").notNull(),
  denId: integer("den_id")
    .notNull()
    .references(() => dens.id),
  ...timestamps,
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id),
  title: text("title").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  /** Needed alongside startTime for calendar export (Google/Outlook links, .ics attachment). */
  endTime: text("end_time").notNull(),
  location: text("location").notNull(),
  details: text("details"),
  createdBy: text("created_by").notNull(),
  /** The linked Discord Scheduled Event, if creating it succeeded. */
  discordEventId: text("discord_event_id"),
  status: text("status", { enum: ["scheduled", "cancelled"] })
    .notNull()
    .default("scheduled"),
  ...timestamps,
});

/** Join table: which dens are eligible for an event, and each den's uniform for it. */
export const eventDens = sqliteTable(
  "event_dens",
  {
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    denId: integer("den_id")
      .notNull()
      .references(() => dens.id),
    uniformType: text("uniform_type", {
      enum: ["class_a", "pack_shirt", "other"],
    }).notNull(),
    /** Only meaningful when uniformType = 'other'. */
    uniformOtherText: text("uniform_other_text"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({ pk: primaryKey({ columns: [table.eventId, table.denId] }) }),
);

export const signups = sqliteTable("signups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id),
  scoutId: integer("scout_id")
    .notNull()
    .references(() => scouts.id),
  parentDiscordId: text("parent_discord_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A row existing means the scout attended — there is no boolean "attended"
 * flag, and this is independent of `signups` (not derived from who signed up).
 */
export const attendance = sqliteTable("attendance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id),
  scoutId: integer("scout_id")
    .notNull()
    .references(() => scouts.id),
  markedBy: text("marked_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
