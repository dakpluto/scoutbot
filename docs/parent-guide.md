# ScoutBot — Parent Guide

ScoutBot handles event signups, den info, and calendar links for the pack.
Everything below works from the Discord server; there's also an optional
web portal for a nicer view of your scouts' signups.

## 1. Get your den role

Before you can register a scout or sign up for events, assign yourself
your scout's den role in the **#🙋-choose-your-den-🙋** channel: react to
the post there with the emoji for your den (e.g. "Wolves", "Tigers") and
Discord gives you that role automatically. ScoutBot uses that role to know
which dens you're allowed to register scouts into and sign up for.

If you have scouts in more than one den, react to each den you need.

## 2. Register your scout(s)

```
/signup register first-name:<name> last-initial:<letter> den:<den>
```

Example: `/signup register first-name:Jamie last-initial:S den:Wolves`

- You need the role for the den you're registering into.
- Only first name + last initial are stored — no other personal info.
- You can register more than one scout; run the command again for each.
- See everyone you've registered with `/signup my-scouts`.

If a scout moves to a different den (e.g. ages up), use:

```
/signup update-den scout:<scout> den:<new den>
```

You'll need the role for the *new* den to do this. Existing signups and
attendance history aren't affected.

## 3. Sign up for an event

When a leader creates an event, ScoutBot posts an announcement with the
date, time, location, and calendar links, and syncs it to Discord's
built-in Scheduled Events. Only dens marked eligible for that event can
sign up — if your scout's den isn't listed, signup will say so.

```
/signup event event-id:<event> scout:<scout>
```

Both `event-id` and `scout` autocomplete as you type, so you can search by
name instead of remembering IDs. The confirmation tells you the uniform
required for that scout's den at that event (Class A, pack shirt, or a
custom note the leader added).

To back out of a signup:

```
/signup cancel event-id:<event> scout:<scout>
```

## 4. Add events to your personal calendar

Every event announcement includes **Google Calendar** and **Outlook**
links, plus a downloadable `.ics` file — click one to add it to your own
calendar app. These links are also available per-event on the web portal
(see below).

## 5. Web portal

```
/portal
```

replies with a link to ScoutBot's web portal. Log in with Discord, then
open **My Scouts** (`/me`) to see, per scout:

- Which den they're in
- Every event they're signed up for, with date/time/location
- Google/Outlook calendar links for each

The portal is read-only for parents — sign up and cancel from Discord with
the `/signup` commands above.

## Quick reference

| Command | What it does |
|---|---|
| `/signup register` | Register a scout in a den you hold the role for |
| `/signup event` | Sign a scout up for an event |
| `/signup cancel` | Cancel a scout's signup |
| `/signup update-den` | Move a scout to a different den |
| `/signup my-scouts` | List your registered scouts |
| `/portal` | Get the web portal link |

All `/signup` replies are private (only you see them).
