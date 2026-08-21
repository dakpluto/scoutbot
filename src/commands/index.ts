import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { attendanceCommand } from "./attendance.js";
import { eventCommand } from "./event.js";
import { portalCommand } from "./portal.js";
import { setupCommand } from "./setup.js";
import { signupCommand } from "./signup.js";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/** Keyed by command name for O(1) dispatch in the interactionCreate handler. */
export const commands = new Map<string, Command>(
  [setupCommand, eventCommand, signupCommand, attendanceCommand, portalCommand].map((command) => [
    command.data.name,
    command,
  ]),
);
