# OPDGrind

A cardiology OPD performance tracker: one keyboard-driven sheet per clinic day
that records when each patient walked in and out, what was asked for, what they
already had done, and where the time actually went —
then prints on A4 landscape as the paper log and syncs to Supabase so previous
days survive the browser.

Each clinician on the team signs in with their own email and password and keeps
their own log; the weekly and monthly reports read that log back as one page of
paper each.

This is the [Cardiology OPD Performance Tracker](https://claude.ai/code/artifact/485ab51e-eecd-4ad8-b766-90e1d8b267cc)
design canvas rebuilt as a real application: same layout, same typography, same
behaviour, now a React app you can host, edit and keep in git.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the build locally
```

The build is plain static files with relative asset URLs, so `dist/` drops
straight onto any static host, or a folder on a hospital web server, with no
server-side runtime.

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and
publishes to GitHub Pages on every push to the default branch:

> https://balajiprasadworks-beep.github.io/OPDGRIND-/

**One-time step before the first deploy succeeds.** In
**Settings → Pages → Build and deployment**, set **Source** to
**GitHub Actions**. A workflow cannot do this for you: `GITHUB_TOKEN` is not
allowed to create a Pages site, so `configure-pages` fails with *Resource not
accessible by integration* until the source is set. Re-run the workflow
afterwards (**Actions → Deploy to GitHub Pages → Run workflow**) and every push
deploys from then on.

To change the doctor's name, the target, or the Supabase project without editing
code, set repository variables under **Settings → Secrets and variables →
Actions → Variables** using the names in the table above. They are variables
rather than secrets on purpose: Vite inlines them into the published JavaScript,
where any visitor can read them, so a secret would only be hiding them from you.

### Cloudflare Pages

[`.github/workflows/cloudflare.yml`](.github/workflows/cloudflare.yml) does the
same for Cloudflare Pages, and creates the Pages project itself on the first
run, so nothing is configured in the Cloudflare dashboard:

> https://opdgrind.pages.dev

It needs one repository **secret** (Settings → Secrets and variables → Actions →
New repository secret):

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template (or a custom token with Account → Cloudflare Pages → Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Only needed if that token can see more than one Cloudflare account — wrangler resolves a single account by itself. It is the 32-character hex id in the dashboard URL, `dash.cloudflare.com/<account id>/…` |

The token really is a secret — it can deploy to your account — which is why it is
a secret while the `VITE_*` build settings above are variables.

**Putting a login in front of it.** Cloudflare Zero Trust → Access →
Applications → Add a self-hosted application, hostname `opdgrind.pages.dev`,
with a policy allowing your own email and one-time PIN as the method. Free for
up to 50 users. This guards the page; the row-level policies in `schema.sql`
guard the data. They are worth having both — but it is the policies that matter,
and they are already in place.

**This repository is public, so the Pages site is too** — anyone with the URL
gets the page and the key inside it. Since the table is scoped per clinician
(see Cloud setup) that no longer means they get the patient rows, but it does
mean they get the sign-in card; a login in front of the host is still worth
having.

## Configuration

Copy `.env.example` to `.env` and fill in your own values; everything is
optional and falls back to the defaults the artifact shipped with.

| Variable | What it sets |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL for cloud sync |
| `VITE_SUPABASE_KEY` | Supabase publishable (anon) key |
| `VITE_DOCTOR_NAME` | Fallback name in the header and under the signature rule, used until a clinician signs in |
| `VITE_UNIT_LINE` | Department line beside the name |
| `VITE_TARGET_MINUTES` | Minutes per patient above which the Min column turns red (default 12) |
| `VITE_SHOW_CHIP_RAIL` | `false` hides the investigations chip rail |

Vite inlines these at build time, so change `.env` and rebuild. To repoint one
browser at a different project without rebuilding, set an override from the
console:

```js
localStorage.setItem('opd-cloud-config', JSON.stringify({ url: '…', key: '…' }))
```

## Cloud setup

Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor
(project → SQL Editor → New query → paste → Run), then press **Sync cloud** in
the app. Until that table exists the app says so in a banner and offers the same
SQL with a copy button — nothing is lost in the meantime, because the log is
written to `localStorage` first and the cloud is only ever a copy of it.

**On the key and the data.** The publishable key still sits in the built
JavaScript where anyone loading the page can read it — but since the policies in
`schema.sql` were scoped to `auth.uid()`, that key on its own grants no access to
`opd_days` at all. Reading a day now needs a signed-in clinician's own token, and
returns only that clinician's rows.

Two things that remain true: anyone can still reach the *page*, so put a login in
front of the host as well if you would rather strangers did not see the sign-in
card; and a clinician's password is the only thing between their account and
their patient list, so it should be a real one.

### How syncing behaves

- Every edit writes `localStorage` immediately (under the signed-in clinician's
  own key) and stamps the day's `updatedAt`.
- A push to Supabase is debounced 1.6s after you stop typing, so a busy clinic
  is a handful of requests, not one per keystroke.
- **Sync cloud** (also run once at load, and on every sign-in) pulls this
  clinician's days, merges last-write-wins per day on `updatedAt`, and pushes
  back anything this device holds newer.
- Offline or misconfigured, the app keeps working; the status line beside the
  sync buttons says what happened, and **Export backup** writes the whole store
  to JSON that **Import backup** reads back.

## Using the sheet

Time In stamps itself the moment you start typing a name, **Out now** stamps the
exit, and the Min column colours red past the target. `Enter` moves to the next
cell, `↓`/`↑` move between patients, and `N`/`R` set New/Review on the Case cell.
Focusing *Investigations asked* or *Done before walk-in* raises the chip rail —
ECG, ECHO, TROP and the rest go in with one tap.

Time away from the desk is kept on two separate clocks, because a planned break
and a ward call are not the same number: **Start break** for the planned kind,
**Interruption** for the unplanned kind, each timestamped, and an interruption
can carry a one-word reason. Both feed the day-close block — break time,
interruptions, net time in OPD (the walk in-to-out span less both), patients seen
and mean minutes per patient.

Clicking **now** under *JR walk in* raises a small **Hello!**, and under *JR walk
out* a **Caio!** — about a second and a half, in its own lane so it never covers
the sheet, and never able to swallow a click.

**Print paper sheet** lays the day out A4 landscape and hides all the
screen-only controls (and the "if delayed, why" column when no row uses it). The
reports print A4 portrait, one page each.

## Clinician profiles

Every clinician signs in with their own email (which is the username) and
password. The log, the reports and the cloud rows are all scoped to whoever is
signed in, so two juniors sharing the department computer keep two separate
logs and neither can read the other's patients.

The drawer behind the arrow beside the date holds **My profile** — display name,
email and password, all changeable — plus the two reports and **Sign out**.

The display name is what heads the sheet, heads both reports, and signs the
printed page, so it is worth setting properly ("Dr A. Kumar", not "akumar").
Until one is set the app falls back to the clinician's email address — never to
`VITE_DOCTOR_NAME`, because on a shared department machine that would print one
clinician's name over another's work, and a report is a signed document. A
profile with no name yet says so in the drawer, with a link straight to the
field.

Signing in needs two one-time steps in Supabase:

1. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor (the app
   offers the same block with a **Copy SQL** button when it notices the table is
   not ready). It adds the `clinician_id` column, keys the table on
   `(clinician_id, date)`, and replaces the old open policies with ones that
   scope every row to `auth.uid()`. It is safe on an empty project, safe over
   the earlier single-doctor table, and safe to run again.
2. **Authentication → Sign In / Providers → Email**: turn **Confirm email**
   off, so a new clinician can be created and used straight away. Leave it on
   and sign-up returns an account with no session — the app says exactly that
   rather than failing silently.

**Days logged before profiles existed** are not lost. On this browser they are
adopted by the first profile that signs in (the old `opd-flow-log-v1` key is
copied, never deleted, so it stays a backup).

Rows already in Supabase are a separate matter. They have no owner, so no
signed-in clinician can see them — and `clinician_id` is deliberately added
*nullable* for exactly that reason: in the SQL editor `auth.uid()` is NULL (the
editor runs as the table's owner and carries no end-user token), so demanding
`not null` up front would try to stamp NULL onto every existing day and fail
with `23502`. To claim those days, sign up in the app first, then run the
adoption statement at the foot of `schema.sql` — by email, or by the clinician
id shown on **My profile** — and run the script once more. That last run locks
the column down and promotes `(clinician_id, date)` to the primary key.

Offline is not a lockout: a cached session keeps working, and only a refresh
token Supabase actually rejects sends you back to the sign-in card.

## The reports

Neither report is a reprint of the daily sheet — no patient names, no
investigations. A week and a month are about the shape of the load, and each is
laid out to be one sheet of A4 portrait you can file or hand over.

**Weekly report** — Monday to Saturday, one line per day: patients seen (with a
bar scaled to the week's busiest day), mean minutes per patient, OPD hours,
break time and time lost to interruptions. After Saturday: total patients,
average load per day, the day with most patients, and the average minutes per
patient. That last figure is *weighted* — total consulting minutes over total
patients — so a four-patient morning cannot drag a forty-patient day around the
way a mean of the daily means would. Below the rule: where the time went — OPD
hours, break time and interruptions. A Sunday clinic, if one ever happens,
appears as a muted row after Saturday rather than being dropped.

**Monthly report** — the calendar month, one line per week, with a ruled month
total beneath, then the same four figures for the month. It adds the two
pictures a month can draw that a week cannot: the load strip, a calendar grid
with each day inked by how busy it was, and the weekday pattern — average
patients by weekday, which is the one that says which day of the week is
actually costing you.

Both reports read the local store, so they work with no network, and both step
backwards and forwards through weeks and months.

## Layout

```
index.html                      page shell
src/App.jsx                     the shell — sign-in gate, view switch, cloud sync
src/config.js                   identity, target minutes, cloud credentials
src/components/DaySheet.jsx     the day — markup, keyboard model, day maths
src/components/Login.jsx        the sign-in / create-profile card
src/components/Drawer.jsx       the dashboard behind the arrow beside the date
src/components/ProfilePanel.jsx name, email, password, clinician id
src/components/ReportShell.jsx  the frame both reports share
src/components/WeekReport.jsx   Monday-to-Saturday report
src/components/MonthReport.jsx  calendar-month report, week by week
src/components/Greeting.jsx     the Hello! / Caio! pop-up
src/lib/auth.js                 Supabase Auth over plain fetch
src/lib/store.js                localStorage day store and its normalising
src/lib/supabase.js             PostgREST calls and the last-write-wins merge
src/lib/stats.js                day, week and month figures — one source for both reports
src/lib/time.js                 IST clock, duration maths, week and month calendars
src/lib/css.js                  CSS-text → React style objects
src/styles/                     Broadsheet design system, page rules, vendored fonts
supabase/schema.sql             the one-time table and policies
```

Both typefaces are vendored under `src/fonts/`, so the app looks the same on a
machine with no internet: Source Serif 4 for the sheet, and a 5KB subset of
Pacifico (SIL Open Font License 1.1) cut down to the eight letters the Hello! and
Caio! greetings need.
