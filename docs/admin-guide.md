# ScoutBot — Administrator Guide

`/setup` is restricted to Discord server **Administrators** — pack-wide
configuration (timezone, dens, leader roles, announcement channel)
shouldn't be changeable by regular den leaders. If you need something
here changed and don't have Administrator on this server, ask whoever
does to run it or to grant you the permission.

Event creation (`/event`, gated by Manage Events) and attendance
(`/attendance`, gated by the Den Leaders/Pack Leadership role) are
covered in the Leader Guide — administrators can run those too, since
Administrator overrides every other permission check.

## First-time setup

Run once per server, in order:

```
/setup guild timezone:<IANA timezone>
```
e.g. `timezone:America/Chicago`. This must run before anything else —
every other `/setup` subcommand requires it.

```
/setup roles den-leader:<role> pack-leadership:<role>
```
Both are optional per call — set one now and the other later if you like.
These control who can run `/attendance` and see the portal's `/roster`
page, not signups.

```
/setup den add name:<den name> role:<Discord role>
```
Run once per den (e.g. "Wolves", "Tigers"). The role you pick is what
gates parent registration and signups for that den — this is the same
role parents self-assign in **#🙋-choose-your-den-🙋**. Check the full
list any time with `/setup den list`.

```
/setup channels event-announcements:<channel>
```
Optional. Routes `/event create`'s public calendar-link announcement to
a specific channel, independent of where the command was run — handy if
leaders create events from a leader-only channel but announcements
should land in a general one. Without this, the announcement posts in
whatever channel `/event create` was run from.

## Quick reference

| Command | What it does |
|---|---|
| `/setup guild` | Set timezone (run first) |
| `/setup roles` | Set Den Leaders / Pack Leadership roles |
| `/setup den add` / `list` | Add/list dens and their gating roles |
| `/setup channels` | Route event announcements to a channel |

All replies are private (only you see them).
