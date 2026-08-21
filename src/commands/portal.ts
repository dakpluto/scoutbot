import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { env } from "../env.js";
import type { Command } from "./index.js";

const data = new SlashCommandBuilder()
  .setName("portal")
  .setDescription("Get the link to the ScoutBot web portal");

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!env.portalUrl) {
    await interaction.reply({
      content: "The web portal isn't set up for this server yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `ScoutBot web portal: ${env.portalUrl}`,
    flags: MessageFlags.Ephemeral,
  });
}

export const portalCommand: Command = { data, execute };
