# ScoutBot

A Discord bot for a Cub Scout pack: it creates Discord events, gates signups
by den (via Discord roles), and lets den leaders record attendance after the
fact. Built to be portable — no pack-specific values are hardcoded, so any
pack can fork this repo and stand it up for their own server.

## Features

- Creates Discord events with date, time, location, details, and which
  den(s) are eligible
- Signups are gated by Discord role — a parent can only sign up scouts for
  dens they hold the matching role for
- Uniform requirements are set per den, per event (not one field for the
  whole event), so "everyone in Class A except the flag ceremony den" is a
  normal case, not a special one
- Attendance is recorded by den leaders after the event, independently of
  who signed up beforehand
- Events can be cancelled without being deleted; cancelling doesn't touch
  existing signups, which stay as historical record

## Requirements

- Node.js 24, but **not 24.19.0** — that release broke native `ObjectWrap`
  addons like `better-sqlite3` with a cleanup-hook assertion crash
  (`RemoveEnvironmentCleanupHook`/`env != nullptr`) that can kill the process
  at almost any point, not just on startup. Use `nvm install 24.18.1 && nvm use
  24.18.1` (see `.nvmrc`) until a patched Node ships. `npm install` (or `npm
  rebuild better-sqlite3`) after switching versions, since it's a native
  module.
- A Discord account with permission to create applications in the
  [Discord Developer Portal](https://discord.com/developers/applications)
- A Discord server (guild) you can add a bot to

## 1. Create a Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**.
2. Under **Bot**, click **Reset Token** to generate a bot token. Copy it —
   you'll need it for `DISCORD_TOKEN` below. Treat it like a password.
3. Under **General Information**, copy the **Application ID** — you'll need
   it for `DISCORD_CLIENT_ID`.
4. Under **OAuth2 → URL Generator**, check the `bot` and
   `applications.commands` scopes, and under bot permissions check at least
   **View Channels**, **Create Events**, **Manage Events** (needed
   separately — Create Events lets the bot create scheduled events, Manage
   Events lets it cancel/edit them later), **Send Messages**, and **Use
   Slash Commands**. Open the generated URL to invite the bot to your
   server.

## 2. Local setup

```bash
git clone https://github.com/<your-fork>/scoutbot.git
cd scoutbot
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token from step 1 |
| `DISCORD_CLIENT_ID` | yes | Application ID from step 1 |
| `DISCORD_DEV_GUILD_ID` | no | Your test server's ID — scopes slash command registration to just that server so changes show up instantly instead of waiting up to an hour for global propagation |
| `DATABASE_PATH` | no | Where the SQLite file lives; defaults to `./scoutbot.db` |
| `BACKUP_REPO_URL` | no | Only needed on the deploy target, for the backup cron job |
| `AGE_PUBLIC_KEY` | no | Only needed on the deploy target, for encrypting backups |

There's no separate config file for den names or role IDs — that mapping is
set at runtime via the `/setup` admin command once the bot is running, and
lives in the database (`dens` table), scoped to your server. This is what
makes the bot portable: nothing pack-specific lives in code or in an env
file that has to be hand-edited.

## 3. Set up the database

```bash
npm run db:generate   # generates SQL migration files from src/db/schema.ts
npm run db:migrate     # applies them to the SQLite file at DATABASE_PATH
```

## 4. Register slash commands and run

```bash
npm run deploy-commands   # registers slash commands with Discord
npm run dev                # runs the bot with auto-restart on file changes
```

`npm run build && npm start` runs the compiled production build instead.

## Deploying (e.g. to a Raspberry Pi)

1. Install Node 24 (via `nvm` is easiest) and, for `better-sqlite3`'s native
   build step, `build-essential` and `python3`.
2. Clone the repo on the device, `npm install`, `cp .env.example .env` and
   fill it in as above, then run the migration and command-registration
   steps from above.
3. Run it as a `systemd` service so it restarts on crash or reboot. Example
   unit file:

   ```ini
   [Unit]
   Description=ScoutBot
   After=network-online.target

   [Service]
   WorkingDirectory=/home/pi/scoutbot
   ExecStart=/usr/bin/node dist/index.js
   Restart=on-failure
   EnvironmentFile=/home/pi/scoutbot/.env

   [Install]
   WantedBy=multi-user.target
   ```

   Then `npm run build`, and `sudo systemctl enable --now scoutbot`.
4. Deploy by pushing to your fork and pulling on the device — this repo
   isn't meant to be edited directly over SSH on the deploy target.

## Backups

Backups aren't part of this repo's runtime — set up a daily cron job on
your deploy target that:

1. Dumps the database: `sqlite3 $DATABASE_PATH .dump > backup.sql`
2. Encrypts it: `age -r <your AGE_PUBLIC_KEY> -o backup.sql.age backup.sql`
3. Deletes the plaintext dump
4. Commits and pushes `backup.sql.age` to a **private** repo of your own —
   keep this separate from your (potentially public) code repo

Generate a keypair with `age-keygen -o key.txt`; keep the private key off
the device's SD card alone (a password manager works well) in case the card
fails. Test the restore path before you need it:

```bash
age -d -i key.txt backup.sql.age > backup.sql
sqlite3 restored.db < backup.sql
```

## Privacy

Only a scout's first name and last initial are stored — no full names, no
dates of birth, no other PII beyond what signups and attendance need. The
database on the deploy device is not encrypted at rest (the intended
deployment is an isolated home network); encrypted backups are the
boundary that matters, since they leave the device.

## License

MIT — see [LICENSE](LICENSE). Fork it and adapt it for your own pack.
