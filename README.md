# Event Scheduler

Find a time that works for everyone. A tiny static site for collecting date +
time-slot availability from a small group. Admins create events with a list of
dates and slot labels; anyone with the link can submit availability by name.
Auto-expires after the last date.

- Frontend: vanilla HTML/CSS/JS, hosted on GitHub Pages.
- Backend: Google Apps Script web app bound to a Google Sheet.
- Storage: that same Google Sheet (`Events` and `Submissions` tabs).
- Admin auth: a single shared passphrase stored in Script Properties.

## Repo layout

```
index.html          Public landing — Active / Expired tabs
event.html          Event detail + availability submission
admin.html          Admin login + create / manage events
css/styles.css      Shared styles
js/config.js        Web App URL (paste after deploy)
js/api.js           Fetch wrapper for the Apps Script backend
js/public.js        Powers index.html
js/event.js         Powers event.html
js/admin.js         Powers admin.html
apps-script/Code.gs Backend source — paste into the bound Apps Script editor
```

## Setup

1. Create a Google Sheet named `Event Availability DB` and open
   Extensions → Apps Script to create a bound script project.
2. Copy the Sheet ID from the sheet's URL into `apps-script/Code.gs`
   (`SHEET_ID` constant at the top), then paste the file's contents into the
   Apps Script editor.
3. In Apps Script: Project Settings → Script Properties → add `ADMIN_PASS`
   with your chosen passphrase.
4. Run `ensureSheets_` once from the editor to create the `Events` and
   `Submissions` tabs.
5. Deploy → New deployment → Web app, Execute as "Me", Access "Anyone".
   Copy the `/exec` URL.
6. Paste that URL into `js/config.js` as `WEB_APP_URL`.
7. Push the repo to GitHub and enable Pages
   (Settings → Pages → Deploy from branch → `main` / root).

When you change `Code.gs`, push a new version via
Deploy → Manage deployments → edit → New version, otherwise the live web app
won't pick up changes.

## Where the data lives

- The Google Sheet is the database and the export — open it directly to grab
  rows. The `Submissions` tab stores `availability` as a JSON object keyed by
  ISO date.
- Rotate the admin passphrase by editing the `ADMIN_PASS` Script Property.
