import { and, eq } from "drizzle-orm";
import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../db/index.js";
import { dens, guilds } from "../db/schema.js";
import type { Command } from "./index.js";

const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure ScoutBot for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("guild")
      .setDescription("Set (or update) this server's ScoutBot configuration")
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription("IANA timezone, e.g. America/Chicago")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("roles")
      .setDescription("Set which roles can record attendance")
      .addRoleOption((opt) =>
        opt.setName("den-leader").setDescription("The Den Leaders role").setRequired(false),
      )
      .addRoleOption((opt) =>
        opt
          .setName("pack-leadership")
          .setDescription("The Pack Leadership role")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("channels")
      .setDescription("Set where ScoutBot posts certain messages")
      .addChannelOption((opt) =>
        opt
          .setName("event-announcements")
          .setDescription("Where /event create's public calendar-link announcement posts")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("den")
      .setDescription("Manage dens")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a den")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Den name, e.g. \"Wolf Den 3\"").setRequired(true),
          )
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("The Discord role that gates signups for this den")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List this server's dens")),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command only works in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === "den") {
    await handleDen(interaction, sub);
    return;
  }

  if (sub === "guild") {
    await handleGuild(interaction);
    return;
  }

  if (sub === "roles") {
    await handleRoles(interaction);
    return;
  }

  if (sub === "channels") {
    await handleChannels(interaction);
    return;
  }
}

async function handleGuild(interaction: ChatInputCommandInteraction): Promise<void> {
  const timezone = interaction.options.getString("timezone", true);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    await interaction.reply({
      content: `"${timezone}" isn't a recognized IANA timezone (e.g. \`America/Chicago\`, \`America/New_York\`).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId!));

  await db
    .insert(guilds)
    .values({
      id: interaction.guildId!,
      name: guild.name,
      timezone,
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: { name: guild.name, timezone, updatedAt: new Date() },
    });

  await interaction.reply({
    content: `ScoutBot is configured for **${guild.name}** with timezone \`${timezone}\`. Next, add dens with \`/setup den add\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRoles(interaction: ChatInputCommandInteraction): Promise<void> {
  const denLeaderRole = interaction.options.getRole("den-leader");
  const packLeadershipRole = interaction.options.getRole("pack-leadership");

  if (!denLeaderRole && !packLeadershipRole) {
    await interaction.reply({
      content: "Provide at least one of `den-leader` or `pack-leadership`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existing = await db.query.guilds.findFirst({
    where: eq(guilds.id, interaction.guildId!),
  });
  if (!existing) {
    await interaction.reply({
      content: "Run `/setup guild` first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db
    .update(guilds)
    .set({
      denLeaderRoleId: denLeaderRole?.id ?? existing.denLeaderRoleId,
      packLeadershipRoleId: packLeadershipRole?.id ?? existing.packLeadershipRoleId,
      updatedAt: new Date(),
    })
    .where(eq(guilds.id, interaction.guildId!));

  const parts: string[] = [];
  if (denLeaderRole) parts.push(`Den Leaders → ${denLeaderRole.toString()}`);
  if (packLeadershipRole) parts.push(`Pack Leadership → ${packLeadershipRole.toString()}`);
  await interaction.reply({
    content: `Updated attendance permissions:\n${parts.join("\n")}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleChannels(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventAnnouncements = interaction.options.getChannel("event-announcements");

  if (!eventAnnouncements) {
    await interaction.reply({
      content: "Provide `event-announcements`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existing = await db.query.guilds.findFirst({
    where: eq(guilds.id, interaction.guildId!),
  });
  if (!existing) {
    await interaction.reply({
      content: "Run `/setup guild` first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db
    .update(guilds)
    .set({ eventAnnounceChannelId: eventAnnouncements.id, updatedAt: new Date() })
    .where(eq(guilds.id, interaction.guildId!));

  await interaction.reply({
    content: `Event-creation announcements will now post in ${eventAnnouncements.toString()}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleDen(interaction: ChatInputCommandInteraction, sub: string): Promise<void> {
  const existing = await db.query.guilds.findFirst({
    where: eq(guilds.id, interaction.guildId!),
  });
  if (!existing) {
    await interaction.reply({
      content: "Run `/setup guild` first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "add") {
    const name = interaction.options.getString("name", true);
    const role = interaction.options.getRole("role", true);

    const duplicate = await db.query.dens.findFirst({
      where: and(eq(dens.guildId, interaction.guildId!), eq(dens.discordRoleId, role.id)),
    });
    if (duplicate) {
      await interaction.reply({
        content: `${role.toString()} is already mapped to den "${duplicate.name}".`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await db.insert(dens).values({
      guildId: interaction.guildId!,
      name,
      discordRoleId: role.id,
    });

    await interaction.reply({
      content: `Added den **${name}**, gated by ${role.toString()}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "list") {
    const rows = await db.query.dens.findMany({
      where: eq(dens.guildId, interaction.guildId!),
    });
    if (rows.length === 0) {
      await interaction.reply({
        content: "No dens configured yet. Add one with `/setup den add`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = rows.map((den) => `**${den.name}** — <@&${den.discordRoleId}>`);
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }
}

export const setupCommand: Command = { data, execute };
