import { and, eq } from "drizzle-orm";
import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../db/index.js";
import { dens, eventDens, events, scouts, signups } from "../db/schema.js";
import { memberRoleIds, requireGuildConfig } from "../lib/guild-config.js";
import type { Command } from "./index.js";

const data = new SlashCommandBuilder()
  .setName("signup")
  .setDescription("Register scouts and sign them up for events")
  .addSubcommand((sub) =>
    sub
      .setName("register")
      .setDescription("Register your scout")
      .addStringOption((opt) =>
        opt.setName("first-name").setDescription("Scout's first name").setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName("last-initial").setDescription("Scout's last initial").setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt.setName("den").setDescription("Den").setRequired(true).setAutocomplete(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("event")
      .setDescription("Sign a scout up for an event")
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
      .setName("cancel")
      .setDescription("Cancel a scout's signup for an event")
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
  .addSubcommand((sub) => sub.setName("my-scouts").setDescription("List your registered scouts"))
  .addSubcommand((sub) =>
    sub
      .setName("update-den")
      .setDescription("Move your scout to a different den")
      .addIntegerOption((opt) =>
        opt.setName("scout").setDescription("Scout").setRequired(true).setAutocomplete(true),
      )
      .addIntegerOption((opt) =>
        opt.setName("den").setDescription("New den").setRequired(true).setAutocomplete(true),
      ),
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = await requireGuildConfig(interaction);
  if (!config) return;

  const sub = interaction.options.getSubcommand();
  if (sub === "register") return handleRegister(interaction);
  if (sub === "event") return handleSignup(interaction);
  if (sub === "cancel") return handleCancel(interaction);
  if (sub === "my-scouts") return handleMyScouts(interaction);
  if (sub === "update-den") return handleUpdateDen(interaction);
}

async function handleRegister(interaction: ChatInputCommandInteraction): Promise<void> {
  const firstName = interaction.options.getString("first-name", true).trim();
  const lastInitial = interaction.options.getString("last-initial", true).trim().slice(0, 1);
  const denId = interaction.options.getInteger("den", true);

  const den = await db.query.dens.findFirst({
    where: and(eq(dens.id, denId), eq(dens.guildId, interaction.guildId!)),
  });
  if (!den) {
    await interaction.reply({ content: "Couldn't find that den.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!memberRoleIds(interaction).includes(den.discordRoleId)) {
    await interaction.reply({
      content: `You need the <@&${den.discordRoleId}> role to register a scout in **${den.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existingScouts = await db.query.scouts.findMany({
    where: and(
      eq(scouts.guildId, interaction.guildId!),
      eq(scouts.parentDiscordId, interaction.user.id),
    ),
  });
  const alreadyRegistered = existingScouts.find(
    (scout) =>
      scout.firstName.toLowerCase() === firstName.toLowerCase() &&
      scout.lastInitial.toLowerCase() === lastInitial.toLowerCase(),
  );
  if (alreadyRegistered) {
    await interaction.reply({
      content: `You already have **${firstName} ${lastInitial}.** registered.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [scout] = await db
    .insert(scouts)
    .values({
      guildId: interaction.guildId!,
      parentDiscordId: interaction.user.id,
      firstName,
      lastInitial,
      denId,
    })
    .returning();

  await interaction.reply({
    content: `Registered **${scout.firstName} ${scout.lastInitial}.** in ${den.name}. Sign up for events with \`/signup event\`.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSignup(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventId = interaction.options.getInteger("event-id", true);
  const scoutId = interaction.options.getInteger("scout", true);

  const scout = await db.query.scouts.findFirst({
    where: and(
      eq(scouts.id, scoutId),
      eq(scouts.guildId, interaction.guildId!),
      eq(scouts.parentDiscordId, interaction.user.id),
    ),
  });
  if (!scout) {
    await interaction.reply({ content: "That's not one of your scouts.", flags: MessageFlags.Ephemeral });
    return;
  }

  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.guildId, interaction.guildId!)),
  });
  if (!event || event.status === "cancelled") {
    await interaction.reply({ content: "That event isn't open for signups.", flags: MessageFlags.Ephemeral });
    return;
  }

  const eligible = await db.query.eventDens.findFirst({
    where: and(eq(eventDens.eventId, eventId), eq(eventDens.denId, scout.denId)),
  });
  if (!eligible) {
    await interaction.reply({
      content: `${scout.firstName}'s den isn't eligible for **${event.title}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const den = await db.query.dens.findFirst({ where: eq(dens.id, scout.denId) });
  if (!den || !memberRoleIds(interaction).includes(den.discordRoleId)) {
    await interaction.reply({
      content: "You no longer hold the role for this scout's den.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existingSignup = await db.query.signups.findFirst({
    where: and(eq(signups.eventId, eventId), eq(signups.scoutId, scoutId)),
  });
  if (existingSignup) {
    await interaction.reply({
      content: `${scout.firstName} is already signed up for **${event.title}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.insert(signups).values({
    eventId,
    scoutId,
    parentDiscordId: interaction.user.id,
  });

  const uniform =
    eligible.uniformType === "other"
      ? `Other (${eligible.uniformOtherText})`
      : eligible.uniformType === "class_a"
        ? "Class A"
        : "Pack shirt";
  await interaction.reply({
    content: `Signed up **${scout.firstName} ${scout.lastInitial}.** for **${event.title}** on ${event.date}. Uniform: ${uniform}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCancel(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventId = interaction.options.getInteger("event-id", true);
  const scoutId = interaction.options.getInteger("scout", true);

  const scout = await db.query.scouts.findFirst({
    where: and(
      eq(scouts.id, scoutId),
      eq(scouts.guildId, interaction.guildId!),
      eq(scouts.parentDiscordId, interaction.user.id),
    ),
  });
  if (!scout) {
    await interaction.reply({ content: "That's not one of your scouts.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existingSignup = await db.query.signups.findFirst({
    where: and(eq(signups.eventId, eventId), eq(signups.scoutId, scoutId)),
  });
  if (!existingSignup) {
    await interaction.reply({ content: "That scout isn't signed up for this event.", flags: MessageFlags.Ephemeral });
    return;
  }

  await db.delete(signups).where(eq(signups.id, existingSignup.id));
  await interaction.reply({
    content: `Cancelled ${scout.firstName}'s signup.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUpdateDen(interaction: ChatInputCommandInteraction): Promise<void> {
  const scoutId = interaction.options.getInteger("scout", true);
  const denId = interaction.options.getInteger("den", true);

  const scout = await db.query.scouts.findFirst({
    where: and(
      eq(scouts.id, scoutId),
      eq(scouts.guildId, interaction.guildId!),
      eq(scouts.parentDiscordId, interaction.user.id),
    ),
  });
  if (!scout) {
    await interaction.reply({ content: "That's not one of your scouts.", flags: MessageFlags.Ephemeral });
    return;
  }

  const den = await db.query.dens.findFirst({
    where: and(eq(dens.id, denId), eq(dens.guildId, interaction.guildId!)),
  });
  if (!den) {
    await interaction.reply({ content: "Couldn't find that den.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (den.id === scout.denId) {
    await interaction.reply({
      content: `${scout.firstName} is already in **${den.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!memberRoleIds(interaction).includes(den.discordRoleId)) {
    await interaction.reply({
      content: `You need the <@&${den.discordRoleId}> role to move a scout into **${den.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.update(scouts).set({ denId, updatedAt: new Date() }).where(eq(scouts.id, scoutId));

  await interaction.reply({
    content: `Moved **${scout.firstName} ${scout.lastInitial}.** to **${den.name}**. This doesn't change any of their existing signups or attendance history.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleMyScouts(interaction: ChatInputCommandInteraction): Promise<void> {
  const rows = await db.query.scouts.findMany({
    where: and(
      eq(scouts.guildId, interaction.guildId!),
      eq(scouts.parentDiscordId, interaction.user.id),
    ),
  });
  if (rows.length === 0) {
    await interaction.reply({
      content: "You haven't registered any scouts yet. Use `/signup register`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const denRows = await db.query.dens.findMany({ where: eq(dens.guildId, interaction.guildId!) });
  const denById = new Map(denRows.map((den) => [den.id, den.name]));
  const lines = rows.map(
    (scout) => `**${scout.firstName} ${scout.lastInitial}.** — ${denById.get(scout.denId) ?? "unknown den"}`,
  );
  await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value).toLowerCase();

  if (focused.name === "den") {
    const rows = await db.query.dens.findMany({ where: eq(dens.guildId, interaction.guildId) });
    const matches = rows.filter((den) => den.name.toLowerCase().includes(query));
    await interaction.respond(
      matches.slice(0, 25).map((den) => ({ name: den.name.slice(0, 100), value: den.id })),
    );
    return;
  }

  if (focused.name === "event-id") {
    const rows = await db.query.events.findMany({
      where: and(eq(events.guildId, interaction.guildId), eq(events.status, "scheduled")),
    });
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
    const rows = await db.query.scouts.findMany({
      where: and(
        eq(scouts.guildId, interaction.guildId),
        eq(scouts.parentDiscordId, interaction.user.id),
      ),
    });
    const matches = rows.filter((scout) =>
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

export const signupCommand: Command = { data, execute, autocomplete };
