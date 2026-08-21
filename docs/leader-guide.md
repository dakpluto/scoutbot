# ScoutBot — Leader Guide

## 0. Who can run what

ScoutBot has two separate permission systems — worth knowing so the right
command isn't blocked on the wrong role:

- **`/event`** is gated by Discord's own **Manage Events** permission.
  Whoever holds that in this server's role settings can run it — there's
  nothing to configure in ScoutBot for this.
- **`/attendance`** and the web portal's **`/roster`** page are gated by
  ScoutBot's own **Den Leaders** / **Pack Leadership** roles, set by a
  server administrator via `/setup roles`.

Pack-wide configuration (`/setup` — timezone, dens, roles, announcement
channel) is restricted to server Administrators; see the Administrator
Guide if you need something changed there.

## 1. Creating events

```
/event create title:<title> date:<YYYY-MM-DD> start-time:<HH:MM> end-time:<HH:MM> location:<location> [details] [template]
```

- `start-time`, `end-time`, and `location` are required *unless* a
  `template` supplies them (see below).
- Creating an event also creates a linked Discord Scheduled Event
  automatically, and posts a public announcement (Google/Outlook links +
  a downloadable `.ics`) to the configured announcements channel, or the
  current channel if none is configured.
- No den is eligible to sign up until you add one — the reply tells you
  to run `/event add-den` next.

```
/event add-den event-id:<event> den:<den> uniform:<Class A | Pack shirt | Other> [other-text]
```
Marks a den eligible for the event and sets its uniform for that event.
`other-text` is required when uniform is "Other". Safe to re-run on a den
already added — it updates the uniform instead of duplicating it. The
linked Discord event's description is rebuilt automatically to show the
uniform breakdown per den.

`/event list [all:true]` — upcoming events by default; `all:true` includes
past and cancelled ones. `/event cancel event-id:<event>` cancels without
deleting (keeps signup/attendance history, cancels the linked Discord
event). `/event delete event-id:<event>` permanently removes an event,
but only if it has **no** signups or attendance recorded — use `cancel`
instead once either exists.

### Templates

Save repeated event shapes so you don't retype the same time/location/
uniform every week:

```
/event template add name:<name> [start-time] [end-time] [location] [details] [auto-add-all-dens] [uniform] [other-text]
```
Set `auto-add-all-dens:true` (with a `uniform`) to have every current den
added automatically when the template is used — good for pack-wide
events. `/event template list` shows saved templates with their IDs;
`/event template remove template:<template>` deletes one.

Use a template when creating an event: `/event create title:<title>
date:<date> template:<template>` — any field the template doesn't set
(or you don't override) falls back to being required directly.

## 2. Attendance

Requires the Den Leaders or Pack Leadership role (see §0).

```
/attendance mark event-id:<event> scout:<scout>
/attendance remove event-id:<event> scout:<scout>
/attendance list event-id:<event>
```
`scout` autocompletes, and narrows to that event's eligible dens once
`event-id` is picked. Attendance is independent of signups — you can mark
a scout who never signed up, and a signed-up scout who didn't attend is
never auto-marked.

## 3. Web portal

`/portal` gives the link. Leaders (Den Leaders/Pack Leadership role) see
an extra **Roster** page (`/roster`) beyond the parent `/me` view:

- Full scout roster — name, den, and resolved parent name
- Every event with its signup list and attendance list side by side

The portal is read-only — there's no attendance-marking from the web yet,
only from `/attendance` in Discord.

## Quick reference

| Command | Requires | What it does |
|---|---|---|
| `/event create` | Manage Events | Create an event (optionally from a template) |
| `/event add-den` | Manage Events | Make a den eligible + set its uniform |
| `/event cancel` / `delete` | Manage Events | Cancel (keeps history) or delete (only if empty) |
| `/event list` | Manage Events | List events |
| `/event template add/list/remove` | Manage Events | Manage reusable event templates |
| `/attendance mark/remove/list` | Den Leaders/Pack Leadership | Record attendance |
| `/portal` | anyone | Get the web portal link |

All replies are private (only you see them) except the public event
announcement.
