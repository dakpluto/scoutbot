import { eq } from "drizzle-orm";
import { MessageFlags } from "discord.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../db/index.js";
import { guilds } from "../db/schema.js";

export type GuildConfig = typeof guilds.$inferSelect;

export async function getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
  return db.query.guilds.findFirst({ where: eq(guilds.id, guildId) });
}

/**
 * Fetches the guild config or replies with a setup hint and returns
 * undefined. Every command that touches dens/events/scouts needs this,
 * since those tables FK to guilds and /setup guild must run first.
 */
export async function requireGuildConfig(
  interaction: ChatInputCommandInteraction,
): Promise<GuildConfig | undefined> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command only works in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return undefined;
  }

  const config = await getGuildConfig(interaction.guildId);
  if (!config) {
    await interaction.reply({
      content: "This server hasn't been set up yet. Ask an admin to run `/setup guild` first.",
      flags: MessageFlags.Ephemeral,
    });
    return undefined;
  }

  return config;
}

/** Role IDs for the invoking member, whether or not the full GuildMember is cached. */
export function memberRoleIds(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): string[] {
  const member = interaction.member;
  if (!member) return [];
  if (Array.isArray(member.roles)) return member.roles;
  return [...member.roles.cache.keys()];
}

/**
 * Attendance is gated on the guild's configured Den Leader / Pack Leadership
 * roles, not on a per-den role like signups are. If neither role has been
 * configured yet, fall back to Discord's Manage Guild permission so admins
 * aren't locked out before running /setup roles.
 */
export function canRecordAttendance(
  interaction: ChatInputCommandInteraction,
  config: GuildConfig,
): boolean {
  const roleIds = memberRoleIds(interaction);
  const hasConfiguredRole =
    (config.denLeaderRoleId && roleIds.includes(config.denLeaderRoleId)) ||
    (config.packLeadershipRoleId && roleIds.includes(config.packLeadershipRoleId));
  if (hasConfiguredRole) return true;

  const rolesConfigured = Boolean(config.denLeaderRoleId || config.packLeadershipRoleId);
  if (rolesConfigured) return false;

  return interaction.memberPermissions?.has("ManageGuild") ?? false;
}
