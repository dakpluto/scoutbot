import { and, desc, eq, inArray } from "drizzle-orm";
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
import { attendance, dens, eventDens, eventTemplates, events, signups } from "../db/schema.js";
import { type GuildConfig, requireGuildConfig } from "../lib/guild-config.js";
import { toUtcDate } from "../lib/timezone.js";
import { isValidDate, isValidTime } from "../lib/validation.js";
import type { Command } from "./index.js";

const UNIFORM_LABELS: Record<string, string> = {
  class_a: "Class A",
  pack_shirt: "Pack shirt",
  other: "Other",
};

const UNIFORM_CHOICES = [
  { name: "Class A", value: "class_a" },
  { name: "Pack shirt", value: "pack_shirt" },
  { name: "Other", value: "other" },
] as const;

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
      .addIntegerOption((opt) =>
        opt
          .setName("template")
          .setDescription("Prefill from a saved template")
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("start-time")
          .setDescription("Start time, 24h HH:MM (required unless the template sets one)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("end-time")
          .setDescription("End time, 24h HH:MM (required unless the template sets one)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("location")
          .setDescription("Location (required unless the template sets one)")
          .setRequired(false),
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
          .addChoices(...UNIFORM_CHOICES),
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
      .setName("delete")
      .setDescription("Permanently delete an event that has no signups or attendance")
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
  )
  .addSubcommandGroup((group) =>
    group
      .setName("template")
      .setDescription("Manage reusable event templates")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Save a new event template")
          .addStringOption((opt) => opt.setName("name").setDescription("Template name").setRequired(true))
          .addStringOption((opt) =>
            opt.setName("start-time").setDescription("Start time, 24h HH:MM").setRequired(false),
          )
          .addStringOption((opt) =>
            opt.setName("end-time").setDescription("End time, 24h HH:MM").setRequired(false),
          )
          .addStringOption((opt) => opt.setName("location").setDescription("Location").setRequired(false))
          .addStringOption((opt) =>
            opt.setName("details").setDescription("Default additional details").setRequired(false),
          )
          .addBooleanOption((opt) =>
            opt
              .setName("auto-add-all-dens")
              .setDescription("Automatically add every current den, with the uniform below")
              .setRequired(false),
          )
          .addStringOption((opt) =>
            opt
              .setName("uniform")
              .setDescription("Uniform for auto-added dens (required if auto-add-all-dens is true)")
              .setRequired(false)
              .addChoices(...UNIFORM_CHOICES),
          )
          .addStringOption((opt) =>
            opt
              .setName("other-text")
              .setDescription("Uniform details, required if uniform is Other")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List saved event templates"))
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Delete a saved event template")
          .addIntegerOption((opt) =>
            opt
              .setName("template")
              .setDescription("Template")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await requireGuildConfig(interaction);
  if (!config) return;

  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  if (group === "template") {
    if (sub === "add") return handleTemplateAdd(interaction);
    if (sub === "list") return handleTemplateList(interaction);
    if (sub === "remove") return handleTemplateRemove(interaction);
    return;
  }

  if (sub === "create") return handleCreate(interaction, config);
  if (sub === "add-den") return handleAddDen(interaction);
  if (sub === "cancel") return handleCancel(interaction);
  if (sub === "delete") return handleDelete(interaction);
  if (sub === "list") return handleList(interaction);
}

/** interaction.guild can be uncached right after a process restart; guildId is always reliable. */
async function resolveGuild(interaction: ChatInputCommandInteraction) {
  return interaction.guild ?? interaction.client.guilds.fetch(interaction.guildId!);
}

/**
 * Rebuilds the full Discord event description from scratch (base details +
 * a den/uniform breakdown), so add-den stays correct even when it's
 * updating a den already on the event rather than adding a new one.
 */
async function buildEventDescription(
  eventId: number,
  baseDetails: string | null,
): Promise<string | undefined> {
  const rows = await db.query.eventDens.findMany({ where: eq(eventDens.eventId, eventId) });
  if (rows.length === 0) return baseDetails ?? undefined;

  const denRows = await db.query.dens.findMany({
    where: inArray(dens.id, rows.map((row) => row.denId)),
  });
  const denById = new Map(denRows.map((den) => [den.id, den.name]));

  const uniformLines = rows.map((row) => {
    const denName = denById.get(row.denId) ?? `Den #${row.denId}`;
    const uniform =
      row.uniformType === "other" ? `Other (${row.uniformOtherText})` : UNIFORM_LABELS[row.uniformType];
    return `${denName}: ${uniform}`;
  });

  const parts = [baseDetails, `Uniforms by den:\n${uniformLines.join("\n")}`].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join("\n\n").slice(0, 1000);
}

async function upsertEventDen(
  eventId: number,
  denId: number,
  uniformType: "class_a" | "pack_shirt" | "other",
  otherText: string | null,
): Promise<void> {
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
}

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  config: GuildConfig,
): Promise<void> {
  const title = interaction.options.getString("title", true);
  const date = interaction.options.getString("date", true);
  const templateId = interaction.options.getInteger("template");
  const details = interaction.options.getString("details");

  let template: typeof eventTemplates.$inferSelect | undefined;
  if (templateId !== null) {
    template = await db.query.eventTemplates.findFirst({
      where: and(eq(eventTemplates.id, templateId), eq(eventTemplates.guildId, interaction.guildId!)),
    });
    if (!template) {
      await interaction.reply({ content: "Couldn't find that template.", flags: MessageFlags.Ephemeral });
      return;
    }
  }

  const startTime = interaction.options.getString("start-time") ?? template?.startTime ?? null;
  const endTime = interaction.options.getString("end-time") ?? template?.endTime ?? null;
  const location = interaction.options.getString("location") ?? template?.location ?? null;
  const effectiveDetails = details ?? template?.details ?? null;

  if (!startTime || !endTime || !location) {
    const missing = [
      !startTime && "start-time",
      !endTime && "end-time",
      !location && "location",
    ]
      .filter(Boolean)
      .join(", ");
    await interaction.reply({
      content: `Missing \`${missing}\` — supply it directly or pick a template that sets it.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
      details: effectiveDetails,
      createdBy: interaction.user.id,
    })
    .returning();

  let addedDenNames: string[] = [];
  if (template?.autoAddAllDens && template.uniformType) {
    const guildDens = await db.query.dens.findMany({ where: eq(dens.guildId, interaction.guildId!) });
    for (const den of guildDens) {
      await upsertEventDen(event.id, den.id, template.uniformType, template.uniformOtherText);
    }
    addedDenNames = guildDens.map((den) => den.name);
  }

  let discordEventNote = "";
  try {
    const guild = await resolveGuild(interaction);
    const description = addedDenNames.length > 0 ? await buildEventDescription(event.id, effectiveDetails) : effectiveDetails ?? undefined;
    const discordEvent = await guild.scheduledEvents.create({
      name: title.slice(0, 100),
      scheduledStartTime: toUtcDate(date, startTime, config.timezone),
      scheduledEndTime: toUtcDate(date, endTime, config.timezone),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: location.slice(0, 100) },
      description,
    });
    await db.update(events).set({ discordEventId: discordEvent.id }).where(eq(events.id, event.id));
  } catch (error) {
    console.error(`Failed to create Discord scheduled event for event #${event.id}:`, error);
    discordEventNote =
      "\n(Couldn't create a linked Discord event — check the bot has the Manage Events permission.)";
  }

  const addedDenNote =
    addedDenNames.length > 0 ? `\nAuto-added dens: ${addedDenNames.join(", ")}.` : "";
  const nextStepNote =
    addedDenNames.length > 0
      ? `Adjust a den's uniform by re-running \`/event add-den event-id:${event.id}\`.`
      : `Now add eligible dens with \`/event add-den event-id:${event.id}\`.`;

  await interaction.reply({
    content: `Created event **${title}** (#${event.id}) on ${date} ${startTime}–${endTime} at ${location}.${addedDenNote}\n${nextStepNote}${discordEventNote}`,
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

  await upsertEventDen(eventId, denId, uniformType, otherText);

  const uniformLabel =
    uniformType === "other" ? `Other (${otherText})` : UNIFORM_LABELS[uniformType];

  let discordEventNote = "";
  if (event.discordEventId) {
    try {
      const guild = await resolveGuild(interaction);
      const description = await buildEventDescription(eventId, event.details);
      await guild.scheduledEvents.edit(event.discordEventId, { description });
    } catch (error) {
      console.error(`Failed to update Discord scheduled event for event #${eventId}:`, error);
      discordEventNote = "\n(Couldn't update the linked Discord event's description.)";
    }
  }

  await interaction.reply({
    content: `**${den.name}** is eligible for **${event.title}** — uniform: ${uniformLabel}.${discordEventNote}`,
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

async function handleDelete(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventId = interaction.options.getInteger("event-id", true);

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.guildId, interaction.guildId!)),
  });
  if (!event) {
    await interaction.reply({ content: "Couldn't find that event.", flags: MessageFlags.Ephemeral });
    return;
  }

  const [existingSignup] = await db.query.signups.findMany({
    where: eq(signups.eventId, eventId),
    limit: 1,
  });
  const [existingAttendance] = await db.query.attendance.findMany({
    where: eq(attendance.eventId, eventId),
    limit: 1,
  });
  if (existingSignup || existingAttendance) {
    await interaction.reply({
      content: `**${event.title}** has signups or attendance recorded, so it can't be deleted — use \`/event cancel event-id:${eventId}\` instead to keep that history.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (event.discordEventId) {
    try {
      const guild = await resolveGuild(interaction);
      await guild.scheduledEvents.delete(event.discordEventId);
    } catch (error) {
      console.error(`Failed to delete Discord scheduled event for event #${event.id}:`, error);
    }
  }

  await db.delete(eventDens).where(eq(eventDens.eventId, eventId));
  await db.delete(events).where(eq(events.id, eventId));

  await interaction.reply({
    content: `Deleted **${event.title}** (${event.date}).`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTemplateAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString("name", true);
  const startTime = interaction.options.getString("start-time");
  const endTime = interaction.options.getString("end-time");
  const location = interaction.options.getString("location");
  const details = interaction.options.getString("details");
  const autoAddAllDens = interaction.options.getBoolean("auto-add-all-dens") ?? false;
  const uniformType = interaction.options.getString("uniform") as
    | "class_a"
    | "pack_shirt"
    | "other"
    | null;
  const otherText = interaction.options.getString("other-text");

  if (startTime && !isValidTime(startTime)) {
    await interaction.reply({
      content: "`start-time` must be 24-hour `HH:MM`, e.g. `18:30`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (endTime && !isValidTime(endTime)) {
    await interaction.reply({
      content: "`end-time` must be 24-hour `HH:MM`, e.g. `20:00`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (autoAddAllDens && !uniformType) {
    await interaction.reply({
      content: "`uniform` is required when `auto-add-all-dens` is true.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (uniformType === "other" && !otherText) {
    await interaction.reply({
      content: "`other-text` is required when `uniform` is Other.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [template] = await db
    .insert(eventTemplates)
    .values({
      guildId: interaction.guildId!,
      name,
      startTime,
      endTime,
      location,
      details,
      autoAddAllDens,
      uniformType: autoAddAllDens ? uniformType : null,
      uniformOtherText: autoAddAllDens && uniformType === "other" ? otherText : null,
    })
    .returning();

  await interaction.reply({
    content: `Saved template **${template.name}** (#${template.id}). Use it with \`/event create template:${template.id}\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTemplateList(interaction: ChatInputCommandInteraction): Promise<void> {
  const rows = await db.query.eventTemplates.findMany({
    where: eq(eventTemplates.guildId, interaction.guildId!),
  });

  if (rows.length === 0) {
    await interaction.reply({ content: "No templates saved yet.", flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = rows.map((template) => {
    const parts = [
      template.startTime && template.endTime ? `${template.startTime}–${template.endTime}` : null,
      template.location,
      template.autoAddAllDens ? "auto-adds all dens" : null,
    ].filter(Boolean);
    return `#${template.id} — **${template.name}**${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}`;
  });
  await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
}

async function handleTemplateRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const templateId = interaction.options.getInteger("template", true);

  const template = await db.query.eventTemplates.findFirst({
    where: and(eq(eventTemplates.id, templateId), eq(eventTemplates.guildId, interaction.guildId!)),
  });
  if (!template) {
    await interaction.reply({ content: "Couldn't find that template.", flags: MessageFlags.Ephemeral });
    return;
  }

  await db.delete(eventTemplates).where(eq(eventTemplates.id, templateId));

  await interaction.reply({
    content: `Deleted template **${template.name}**.`,
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

  if (focused.name === "template") {
    const rows = await db.query.eventTemplates.findMany({
      where: eq(eventTemplates.guildId, interaction.guildId),
    });
    const query = String(focused.value).toLowerCase();
    const matches = rows.filter((template) => template.name.toLowerCase().includes(query));
    await interaction.respond(
      matches.slice(0, 25).map((template) => ({ name: template.name.slice(0, 100), value: template.id })),
    );
    return;
  }

  await interaction.respond([]);
}

export const eventCommand: Command = { data, execute, autocomplete };
