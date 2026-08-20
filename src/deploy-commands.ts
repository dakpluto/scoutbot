import { REST, Routes } from "discord.js";
import { closeDb } from "./db/index.js";
import { env } from "./env.js";
import { commands } from "./commands/index.js";

const body = [...commands.values()].map((command) => command.data.toJSON());

const rest = new REST().setToken(env.discordToken);

const route = env.discordDevGuildId
  ? Routes.applicationGuildCommands(env.discordClientId, env.discordDevGuildId)
  : Routes.applicationCommands(env.discordClientId);

const target = env.discordDevGuildId
  ? `guild ${env.discordDevGuildId} (dev)`
  : "globally";

console.log(`Registering ${body.length} slash command(s) ${target}...`);
await rest.put(route, { body });
console.log("Done.");

closeDb();
