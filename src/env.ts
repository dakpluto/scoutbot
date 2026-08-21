import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  discordClientId: required("DISCORD_CLIENT_ID"),
  /** Optional: restricts slash command registration to one guild for fast iteration in dev. */
  discordDevGuildId: process.env.DISCORD_DEV_GUILD_ID,
  databasePath: process.env.DATABASE_PATH ?? "./scoutbot.db",
  backupRepoUrl: process.env.BACKUP_REPO_URL,
  agePublicKey: process.env.AGE_PUBLIC_KEY,
  /** Optional: shown by /portal. Not every deployment runs the web portal. */
  portalUrl: process.env.PORTAL_URL,
};
