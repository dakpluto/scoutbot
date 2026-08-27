import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Only imported by src/web/server.ts — kept separate from src/env.ts so the bot process never requires these. */
export const webEnv = {
  discordClientId: required("DISCORD_CLIENT_ID"),
  discordToken: required("DISCORD_TOKEN"),
  discordClientSecret: required("DISCORD_CLIENT_SECRET"),
  /** The one guild this portal instance serves — each pack runs its own web portal alongside its own bot. */
  webGuildId: required("WEB_GUILD_ID"),
  /** e.g. http://localhost:3000 in dev; used to build the OAuth redirect_uri as `${webBaseUrl}/auth/callback`. */
  webBaseUrl: required("WEB_BASE_URL"),
  webPort: Number(process.env.WEB_PORT ?? 3000),
  sessionSecret: required("SESSION_SECRET"),
  /** Discord user ID allowed onto /status. Unset means the status page is disabled for everyone. */
  ownerDiscordId: process.env.OWNER_DISCORD_ID,
};
