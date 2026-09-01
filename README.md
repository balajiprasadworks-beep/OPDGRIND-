# OPDGrind

A cardiology OPD performance tracker: one keyboard-driven sheet per clinic day
that records when each patient walked in and out, what was asked for, what they
already had done, and where the time actually went — then prints on A4 landscape
as the paper log and syncs to Supabase so previous days survive the browser.

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

It needs two repository **secrets** (Settings → Secrets and variables → Actions
→ New repository secret):

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template (or a custom token with Account → Cloudflare Pages → Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | the 32-character hex id in the dashboard URL, `dash.cloudflare.com/<account id>/…` |

These two really are secrets — the API token can deploy to your account — which
is why they are secrets and the `VITE_*` build settings above are variables.

**Putting a login in front of it.** Cloudflare Zero Trust → Access →
Applications → Add a self-hosted application, hostname `opdgrind.pages.dev`,
with a policy allowing your own email and one-time PIN as the method. Free for
up to 50 users. Note what that does and does not buy: it stops strangers loading
the page, but anyone who has already seen the Supabase key can still call the
REST API directly, because the policies in `schema.sql` accept the anonymous
key. Access guards the page; only RLS guards the data.

**This repository is public, so the Pages site is too** — anyone with the URL
gets the sheet, the key inside it, and therefore every patient row. See the
note under Cloud setup, and prefer a host that can put a login in front of the
page if the log holds real names.

## Configuration

Copy `.env.example` to `.env` and fill in your own values; everything is
optional and falls back to the defaults the artifact shipped with.

| Variable | What it sets |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL for cloud sync |
| `VITE_SUPABASE_KEY` | Supabase publishable (anon) key |
| `VITE_DOCTOR_NAME` | Name in the header and under the day-close signature rule |
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

**On the key and the data.** The publishable key sits in the built JavaScript,
where anyone loading the page can read it; the row-level security policies in
`schema.sql` are what actually guard the table, and as written they let any
holder of the URL and key read and write every day. That is a reasonable trade
for a single doctor's private deployment. If this is ever hosted publicly, or
starts holding names and OPD numbers you would not hand to a stranger, put
Supabase Auth in front of it and scope those policies to authenticated users.

### How syncing behaves

- Every edit writes `localStorage` immediately and stamps the day's `updatedAt`.
- A push to Supabase is debounced 1.6s after you stop typing, so a busy clinic
  is a handful of requests, not one per keystroke.
- **Sync cloud** (also run once at load) pulls every day, merges last-write-wins
  per day on `updatedAt`, and pushes back anything this device holds newer.
- Offline or misconfigured, the app keeps working; the status line beside the
  sync buttons says what happened, and **Export backup** writes the whole store
  to JSON that **Import backup** reads back.

## Using the sheet

Time In stamps itself the moment you start typing a name, **Out now** stamps the
exit, and the Min column colours red past the target. `Enter` moves to the next
cell, `↓`/`↑` move between patients, and `N`/`R` set New/Review on the Case cell.
Focusing *Investigations asked* or *Done before walk-in* raises the chip rail —
ECG, ECHO, TROP and the rest go in with one tap. JR walk in/out and the break
toggle feed the day-close block: break time, net time in OPD, patients seen and
mean minutes per patient. **Print paper sheet** lays it out A4 landscape and
hides all the screen-only controls (and the "if delayed, why" column when no row
uses it).

## Layout

```
index.html            page shell
src/App.jsx           the whole sheet — markup, keyboard model, day maths
src/config.js         identity, target minutes, cloud credentials
src/lib/store.js      localStorage day store and its normalising
src/lib/supabase.js   PostgREST calls and the last-write-wins merge
src/lib/time.js       IST clock and duration maths
src/lib/css.js        CSS-text → React style objects
src/styles/           Broadsheet design system, page rules, vendored fonts
supabase/schema.sql   the one-time table and policies
```

The typeface (Source Serif 4) is vendored under `src/fonts/`, so the sheet looks
the same on a machine with no internet.
