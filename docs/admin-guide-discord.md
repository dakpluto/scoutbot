**📋 ScoutBot — Administrator Guide**

`/setup` is restricted to Discord server **Administrators** — pack-wide config (timezone, dens, leader roles, announcement channel) isn't changeable by regular leaders. No Administrator permission? Ask whoever has it to run these, or grant you the permission.

`/event` (Manage Events) and `/attendance` (Den Leaders/Pack Leadership role) are covered in the Leader Guide — admins can run those too, since Administrator overrides every other check.

**First-time setup** (in order)
`/setup guild timezone:<IANA tz>` — must run first.
`/setup roles den-leader:<role> pack-leadership:<role>` — gates `/attendance` + the portal's Roster page.
`/setup den add name:<den> role:<role>` — once per den; that role is what parents self-assign in #🙋-choose-your-den-🙋. `/setup den list` to review.
`/setup channels event-announcements:<channel>` — optional, routes `/event create`'s public announcement somewhere other than the channel it was run in.

**Quick reference**
`/setup guild` · `/setup roles` · `/setup den add/list` · `/setup channels`
