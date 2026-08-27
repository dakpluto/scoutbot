import { and, eq } from "drizzle-orm";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { db } from "../db/index.js";
import { attendance, eventDens, events, scouts } from "../db/schema.js";
import { canRecordAttendance, requireGuildConfig } from "../lib/guild-config.js";
import type { Command } from "./index.js";

const data = new SlashCommandBuilder()
  .setName("attendance")
  .setDescription("Record and view event attendance")
  .addSubcommand((sub) =>
    sub
      .setName("mark")
      .setDescription("Mark a scout as having attended an event")
      .addIntegerOption((opt) =>
        opt
          .setName("event-id")
          .setDescription("Event")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((opt) =>
        opt.setName("scout").setDescription("Scout").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Undo an attendance mark")
      .addIntegerOption((opt) =>
        opt
          .setName("event-id")
          .setDescription("Event")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((opt) =>
        opt.setName("scout").setDescription("Scout").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List attendance for an event")
      .addIntegerOption((opt) =>
        opt
          .setName("event-id")
          .setDescription("Event")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await requireGuildConfig(interaction);
  if (!config) return;

  if (!canRecordAttendance(interaction, config)) {
    await interaction.reply({
      content: "You need the Den Leaders or Pack Leadership role to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "mark") return handleMark(interaction);
  if (sub === "remove") return handleRemove(interaction);
  if (sub === "list") return handleList(interaction);
}

async function resolveEventAndScout(interaction: ChatInputCommandInteraction) {
  const eventId = interaction.options.getInteger("event-id", true);
  const scoutId = interaction.options.getInteger("scout", true);

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.guildId, interaction.guildId!)),
  });
  const scout = await db.query.scouts.findFirst({
    where: and(eq(scouts.id, scoutId), eq(scouts.guildId, interaction.guildId!)),
  });
  return { eventId, scoutId, event, scout };
}

async function handleMark(interaction: ChatInputCommandInteraction): Promise<void> {
  const { eventId, scoutId, event, scout } = await resolveEventAndScout(interaction);
  if (!event || !scout) {
    await interaction.reply({ content: "Couldn't find that event or scout.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existing = await db.query.attendance.findFirst({
    where: and(eq(attendance.eventId, eventId), eq(attendance.scoutId, scoutId)),
  });
  if (existing) {
    await interaction.reply({
      content: `${scout.firstName} is already marked as attended for **${event.title}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.insert(attendance).values({ eventId, scoutId, markedBy: interaction.user.id });
  await interaction.reply({
    content: `Marked **${scout.firstName} ${scout.lastInitial}.** as attended for **${event.title}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const { eventId, scoutId, event, scout } = await resolveEventAndScout(interaction);
  if (!event || !scout) {
    await interaction.reply({ content: "Couldn't find that event or scout.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existing = await db.query.attendance.findFirst({
    where: and(eq(attendance.eventId, eventId), eq(attendance.scoutId, scoutId)),
  });
  if (!existing) {
    await interaction.reply({
      content: `${scout.firstName} isn't marked as attended for **${event.title}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.delete(attendance).where(eq(attendance.id, existing.id));
  await interaction.reply({
    content: `Removed ${scout.firstName}'s attendance mark for **${event.title}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventId = interaction.options.getInteger("event-id", true);
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.guildId, interaction.guildId!)),
  });
  if (!event) {
    await interaction.reply({ content: "Couldn't find that event.", flags: MessageFlags.Ephemeral });
    return;
  }

  const rows = await db.query.attendance.findMany({ where: eq(attendance.eventId, eventId) });
  if (rows.length === 0) {
    await interaction.reply({ content: `No attendance recorded yet for **${event.title}**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const scoutIds = rows.map((row) => row.scoutId).filter((id): id is number => id !== null);
  const scoutRows = await db.query.scouts.findMany({ where: eq(scouts.guildId, interaction.guildId!) });
  const scoutById = new Map(scoutRows.map((scout) => [scout.id, scout]));

  const lines = scoutIds
    .map((id) => scoutById.get(id))
    .filter((scout): scout is NonNullable<typeof scout> => Boolean(scout))
    .map((scout) => `${scout.firstName} ${scout.lastInitial}.`);

  await interaction.reply({
    content: `**${event.title}** — ${lines.length} attended:\n${lines.join("\n")}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value).toLowerCase();

  if (focused.name === "event-id") {
    const rows = await db.query.events.findMany({ where: eq(events.guildId, interaction.guildId) });
    const matches = rows.filter((event) => event.title.toLowerCase().includes(query));
    await interaction.respond(
      matches.slice(0, 25).map((event) => ({
        name: `#${event.id} ${event.title} — ${event.date}`.slice(0, 100),
        value: event.id,
      })),
    );
    return;
  }

  if (focused.name === "scout") {
    const eventId = interaction.options.getInteger("event-id");
    let scoutRows = await db.query.scouts.findMany({ where: eq(scouts.guildId, interaction.guildId) });

    if (eventId) {
      const eligibleDens = await db.query.eventDens.findMany({
        where: eq(eventDens.eventId, eventId),
      });
      const eligibleDenIds = new Set(eligibleDens.map((row) => row.denId));
      if (eligibleDenIds.size > 0) {
        scoutRows = scoutRows.filter((scout) => eligibleDenIds.has(scout.denId));
      }
    }

    const matches = scoutRows.filter((scout) =>
      `${scout.firstName} ${scout.lastInitial}`.toLowerCase().includes(query),
    );
    await interaction.respond(
      matches
        .slice(0, 25)
        .map((scout) => ({ name: `${scout.firstName} ${scout.lastInitial}.`, value: scout.id })),
    );
    return;
  }

  await interaction.respond([]);
}

export const attendanceCommand: Command = { data, execute, autocomplete };
