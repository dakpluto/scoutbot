**📋 ScoutBot — Leader Guide**

**0. Who can run what**
`/event` needs Discord's **Manage Events** permission. `/attendance` and the portal's **Roster** page need ScoutBot's own **Den Leaders**/**Pack Leadership** role, set by a server admin via `/setup roles`. Pack-wide config (`/setup`) is admin-only — see the Administrator Guide.

**1. Creating events**
`/event create title:<title> date:<YYYY-MM-DD> start-time:<HH:MM> end-time:<HH:MM> location:<loc> [details] [template]` — `start-time`/`end-time`/`location` only optional if a template supplies them. Auto-creates a linked Discord Scheduled Event + posts the public calendar-link announcement.

No den can sign up until you add one:
`/event add-den event-id:<event> den:<den> uniform:<Class A|Pack shirt|Other> [other-text]` — safe to re-run to change a den's uniform.

`/event list [all:true]` · `/event cancel event-id:<event>` (keeps history) · `/event delete event-id:<event>` (only if no signups/attendance — use cancel otherwise).

**Templates**: `/event template add name:<name> [start-time] [end-time] [location] [details] [auto-add-all-dens] [uniform] [other-text]` (auto-add-all-dens adds every den automatically) · `/event template list` · `/event template remove template:<template>`. Apply with `/event create ... template:<template>`.

**2. Attendance** (Den Leaders/Pack Leadership role required)
`/attendance mark event-id:<event> scout:<scout>` · `/attendance remove ...` · `/attendance list event-id:<event>` — independent of signups, no auto-marking either direction.

**3. Web portal**
`/portal` for the link. Leaders get an extra **Roster** page: full scout roster with parent names, plus per-event signup/attendance lists. Read-only — mark attendance from Discord.

**Quick reference**
`/event create` · `/event add-den` · `/event cancel/delete/list` · `/event template add/list/remove` · `/attendance mark/remove/list` · `/portal`
