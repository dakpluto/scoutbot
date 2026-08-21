**📋 ScoutBot — Parent Quick Start**

**1. Get your den role**
React to the post in <#1205671539236929607> (🙋-choose-your-den-🙋) with your scout's den (e.g. Wolves, Tigers) to get that role. You need it before you can register a scout or sign up for events. Have a scout in more than one den? React to each one.

**2. Register your scout**
`/signup register first-name:<name> last-initial:<letter> den:<den>`
Only first name + last initial are stored. Run it again for each scout. Check who you've registered with `/signup my-scouts`.

Scout moving dens? `/signup update-den scout:<scout> den:<new den>` — you'll need the new den's role. Doesn't affect existing signups/attendance.

**3. Sign up for events**
`/signup event event-id:<event> scout:<scout>` — both fields autocomplete, so just start typing a name. Only dens marked eligible for an event can sign up; you'll get told if your scout's den isn't eligible. The confirmation shows the required uniform.

To cancel: `/signup cancel event-id:<event> scout:<scout>`

**4. Calendar links**
Every event announcement has Google Calendar / Outlook links + a `.ics` file — click to add it to your calendar.

**5. Web portal**
`/portal` gives you the link. Log in with Discord → **My Scouts** shows each scout's den, signups, and calendar links. Read-only — sign up/cancel from Discord.

**Quick reference**
`/signup register` · `/signup event` · `/signup cancel` · `/signup update-den` · `/signup my-scouts` · `/portal`

All `/signup` replies are private — only you see them.
