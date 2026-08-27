import { and, eq } from "drizzle-orm";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { db } from "../db/index.js";
import { scouts } from "../db/schema.js";
import { canRecordAttendance, requireGuildConfig } from "../lib/guild-config.js";
import type { Command } from "./index.js";

const data = new SlashCommandBuilder()
  .setName("scout")
  .setDescription("Manage a scout's roster status")
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Set a scout's status")
      .addIntegerOption((opt) =>
        opt.setName("scout").setDescription("Scout").setRequired(true).setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("status")
          .setDescription("New status")
          .setRequired(true)
          .addChoices(
            { name: "Active", value: "active" },
            { name: "Bridged (moved on to a troop)", value: "bridged" },
            { name: "Left", value: "left" },
          ),
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
  if (sub === "status") return handleStatus(interaction);
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const scoutId = interaction.options.getInteger("scout", true);
  const status = interaction.options.getString("status", true) as "active" | "bridged" | "left";

  const scout = await db.query.scouts.findFirst({
    where: and(eq(scouts.id, scoutId), eq(scouts.guildId, interaction.guildId!)),
  });
  if (!scout) {
    await interaction.reply({ content: "Couldn't find that scout.", flags: MessageFlags.Ephemeral });
    return;
  }

  await db.update(scouts).set({ status, statusChangedAt: new Date() }).where(eq(scouts.id, scoutId));

  const label = status === "active" ? "Active" : status === "bridged" ? "Bridged" : "Left";
  await interaction.reply({
    content: `Set **${scout.firstName} ${scout.lastInitial}.** to **${label}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "scout") {
    await interaction.respond([]);
    return;
  }

  const query = String(focused.value).toLowerCase();
  const rows = await db.query.scouts.findMany({ where: eq(scouts.guildId, interaction.guildId) });
  const matches = rows.filter((scout) => `${scout.firstName} ${scout.lastInitial}`.toLowerCase().includes(query));
  await interaction.respond(
    matches.slice(0, 25).map((scout) => ({
      name: `${scout.firstName} ${scout.lastInitial}. (${scout.status})`.slice(0, 100),
      value: scout.id,
    })),
  );
}

export const scoutCommand: Command = { data, execute, autocomplete };
