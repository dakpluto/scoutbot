import { webEnv } from "./env.js";

export interface DiscordIdentity {
  id: string;
  username: string;
}

export interface GuildMemberInfo {
  roleIds: string[];
  displayName: string;
}

function redirectUri(): string {
  return `${webEnv.webBaseUrl}/auth/callback`;
}

export function buildAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: webEnv.discordClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "identify",
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Exchanges an OAuth authorization code for an access token, then fetches the identifying user. */
export async function exchangeCodeForIdentity(code: string): Promise<DiscordIdentity> {
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: webEnv.discordClientId,
      client_secret: webEnv.discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Discord token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userResponse.ok) {
    throw new Error(`Discord identify failed: ${userResponse.status} ${await userResponse.text()}`);
  }
  const user = (await userResponse.json()) as { id: string; username: string };
  return { id: user.id, username: user.username };
}

/** Looks up a user's roles in the portal's configured guild using the bot's own token — returns null if they're not a member. */
export async function fetchGuildMember(discordUserId: string): Promise<GuildMemberInfo | null> {
  const response = await fetch(
    `https://discord.com/api/guilds/${webEnv.webGuildId}/members/${discordUserId}`,
    { headers: { Authorization: `Bot ${webEnv.discordToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Discord member lookup failed: ${response.status} ${await response.text()}`);
  }
  const member = (await response.json()) as { roles: string[]; nick: string | null; user: { username: string } };
  return { roleIds: member.roles, displayName: member.nick ?? member.user.username };
}

/** Fetches every member of the portal's guild in one pass, for resolving parentDiscordId -> display name across a roster page. */
export async function fetchAllGuildMembers(): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  let after = "0";
  for (;;) {
    const response = await fetch(
      `https://discord.com/api/guilds/${webEnv.webGuildId}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${webEnv.discordToken}` } },
    );
    if (!response.ok) {
      throw new Error(`Discord member list failed: ${response.status} ${await response.text()}`);
    }
    const page = (await response.json()) as Array<{
      user: { id: string; username: string };
      nick: string | null;
    }>;
    for (const member of page) {
      byId.set(member.user.id, member.nick ?? member.user.username);
    }
    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }
  return byId;
}
