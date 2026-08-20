import { and, desc, eq } from "drizzle-orm";
import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../db/index.js";
import { dens, eventDens, events } from "../db/schema.js";
import { type GuildConfig, requireGuildConfig } from "../lib/guild-config.js";
import { toUtcDate } from "../lib/timezone.js";
import { isValidDate, isValidTime } from "../lib/validation.js";
import type { Command } from "./index.js";

const UNIFORM_LABELS: Record<string, string> = {
  class_a: "Class A",
  pack_shirt: "Pack shirt",
  other: "Other",
};

const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("Create and manage pack events")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new event")
      .addStringOption((opt) => opt.setName("title").setDescription("Event title").setRequired(true))
      .addStringOption((opt) =>
        opt.setName("date").setDescription("Date, YYYY-MM-DD").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("start-time").setDescription("Start time, 24h HH:MM").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("end-time").setDescription("End time, 24h HH:MM").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("location").setDescription("Location").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("details").setDescription("Additional details").setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add-den")
      .setDescription("Make a den eligible for an event, with its uniform")
      .addIntegerOption((opt) =>
        opt
          .setName("event-id")
          .setDescription("Event")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption((opt) =>
        opt.setName("den").setDescription("Den").setRequired(true).setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("uniform")
          .setDescription("Uniform for this den at this event")
          .setRequired(true)
          .addChoices(
            { name: "Class A", value: "class_a" },
            { name: "Pack shirt", value: "pack_shirt" },
            { name: "Other", value: "other" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("other-text")
          .setDescription("Uniform details, required if uniform is Other")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancel an event without deleting it")
      .addIntegerOption((opt) =>
        opt
          .setName("event-id")
          .setDescription("Event")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List events")
      .addBooleanOption((opt) =>
        opt
          .setName("all")
          .setDescription("Include past and cancelled events (default: upcoming only)")
          .setRequired(false),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await requireGuildConfig(interaction);
  if (!config) return;

  const sub = interaction.options.getSubcommand();
  if (sub === "create") return handleCreate(interaction, config);
  if (sub === "add-den") return handleAddDen(interaction);
  if (sub === "cancel") return handleCancel(interaction);
  if (sub === "list") return handleList(interaction);
}

/** interaction.guild can be uncached right after a process restart; guildId is always reliable. */
async function resolveGuild(interaction: ChatInputCommandInteraction) {
  return interaction.guild ?? interaction.client.guilds.fetch(interaction.guildId!);
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  config: GuildConfig,
): Promise<void> {
  const title = interaction.options.getString("title", true);
  const date = interaction.options.getString("date", true);
  const startTime = interaction.options.getString("start-time", true);
  const endTime = interaction.options.getString("end-time", true);
  const location = interaction.options.getString("location", true);
  const details = interaction.options.getString("details");

  if (!isValidDate(date)) {
    await interaction.reply({
      content: "`date` must be in `YYYY-MM-DD` format, e.g. `2026-09-12`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    await interaction.reply({
      content: "`start-time` and `end-time` must be 24-hour `HH:MM`, e.g. `18:30`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (endTime <= startTime) {
    await interaction.reply({ content: "`end-time` must be after `start-time`.", flags: MessageFlags.Ephemeral });
    return;
  }

  const [event] = await db
    .insert(events)
    .values({
      guildId: interaction.guildId!,
      title,
      date,
      startTime,
      endTime,
      location,
      details,
      createdBy: interaction.user.id,
    })
    .returning();

  let discordEventNote = "";
  try {
    const guild = await resolveGuild(interaction);
    const discordEvent = await guild.scheduledEvents.create({
      name: title.slice(0, 100),
      scheduledStartTime: toUtcDate(date, startTime, config.timezone),
      scheduledEndTime: toUtcDate(date, endTime, config.timezone),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: location.slice(0, 100) },
      description: details ?? undefined,
    });
    await db.update(events).set({ discordEventId: discordEvent.id }).where(eq(events.id, event.id));
  } catch (error) {
    console.error(`Failed to create Discord scheduled event for event #${event.id}:`, error);
    discordEventNote =
      "\n(Couldn't create a linked Discord event — check the bot has the Manage Events permission.)";
  }

  await interaction.reply({
    content: `Created event **${title}** (#${event.id}) on ${date} ${startTime}–${endTime} at ${location}.\nNow add eligible dens with \`/event add-den event-id:${event.id}\`.${discordEventNote}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAddDen(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventId = interaction.options.getInteger("event-id", true);
  const denId = interaction.options.getInteger("den", true);
  const uniformType = interaction.options.getString("uniform", true) as
    | "class_a"
    | "pack_shirt"
    | "other";
  const otherText = interaction.options.getString("other-text");

  if (uniformType === "other" && !otherText) {
    await interaction.reply({
      content: "`other-text` is required when `uniform` is Other.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.guildId, interaction.guildId!)),
  });
  const den = await db.query.dens.findFirst({
    where: and(eq(dens.id, denId), eq(dens.guildId, interaction.guildId!)),
  });
  if (!event || !den) {
    await interaction.reply({ content: "Couldn't find that event or den.", flags: MessageFlags.Ephemeral });
    return;
  }

  await db
    .insert(eventDens)
    .values({
      eventId,
      denId,
      uniformType,
      uniformOtherText: uniformType === "other" ? otherText : null,
    })
    .onConflictDoUpdate({
      target: [eventDens.eventId, eventDens.denId],
      set: { uniformType, uniformOtherText: uniformType === "other" ? otherText : null },
    });

  const uniformLabel =
    uniformType === "other" ? `Other (${otherText})` : UNIFORM_LABELS[uniformType];
  await interaction.reply({
    content: `**${den.name}** is eligible for **${event.title}** — uniform: ${uniformLabel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventId = interaction.options.getInteger("event-id", true);

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.guildId, interaction.guildId!)),
  });
  if (!event) {
    await interaction.reply({ content: "Couldn't find that event.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (event.status === "cancelled") {
    await interaction.reply({ content: `**${event.title}** is already cancelled.`, flags: MessageFlags.Ephemeral });
    return;
  }

  await db
    .update(events)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(events.id, eventId));

  let discordEventNote = "";
  if (event.discordEventId) {
    try {
      const guild = await resolveGuild(interaction);
      await guild.scheduledEvents.edit(event.discordEventId, {
        status: GuildScheduledEventStatus.Canceled,
      });
    } catch (error) {
      console.error(`Failed to cancel Discord scheduled event for event #${event.id}:`, error);
      discordEventNote = "\n(Couldn't cancel the linked Discord event — you may need to cancel it manually.)";
    }
  }

  await interaction.reply({
    content: `Cancelled **${event.title}** (${event.date}). Existing signups are kept as a historical record.${discordEventNote}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  const showAll = interaction.options.getBoolean("all") ?? false;

  const rows = await db.query.events.findMany({
    where: eq(events.guildId, interaction.guildId!),
    orderBy: desc(events.date),
    limit: 25,
  });

  const today = new Date().toISOString().slice(0, 10);
  const filtered = showAll
    ? rows
    : rows.filter((event) => event.status === "scheduled" && event.date >= today);

  if (filtered.length === 0) {
    await interaction.reply({ content: "No events to show.", flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = filtered.map((event) => {
    const status = event.status === "cancelled" ? " _(cancelled)_" : "";
    return `#${event.id} — **${event.title}**${status} — ${event.date} ${event.startTime} @ ${event.location}`;
  });
  await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);

  if (focused.name === "event-id") {
    const rows = await db.query.events.findMany({
      where: eq(events.guildId, interaction.guildId),
      orderBy: desc(events.date),
      limit: 25,
    });
    const query = String(focused.value).toLowerCase();
    const matches = rows.filter((event) => event.title.toLowerCase().includes(query));
    await interaction.respond(
      matches.slice(0, 25).map((event) => ({
        name: `#${event.id} ${event.title} — ${event.date}`.slice(0, 100),
        value: event.id,
      })),
    );
    return;
  }

  if (focused.name === "den") {
    const rows = await db.query.dens.findMany({ where: eq(dens.guildId, interaction.guildId) });
    const query = String(focused.value).toLowerCase();
    const matches = rows.filter((den) => den.name.toLowerCase().includes(query));
    await interaction.respond(
      matches.slice(0, 25).map((den) => ({ name: den.name.slice(0, 100), value: den.id })),
    );
    return;
  }

  await interaction.respond([]);
}

export const eventCommand: Command = { data, execute, autocomplete };
