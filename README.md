# Outreach Engine

Automates the first 4 messages to a lead, alternating email and WhatsApp.
Leads and their state live in a Google Sheet; the engine runs as a cron job on Vercel.

**Operating mode (mixed):** you approve step 1 at `/`; steps 2–4 go out on their own
according to the cadence. Any reply from the lead stops the sequence.

> The Sheet's tab names, column names and status values are in Spanish because the code
> reads them by those exact names. This README keeps them as they are and explains each one.

---

## How it works

Each cron run (`/api/cron`) does three things, in order:

1. **Detects replies.** It checks the Gmail threads of emails already sent and the WhatsApp
   webhook. If the lead replied, the lead moves to `respondio` (replied) and anything pending
   is cancelled.
2. **Plans.** For each active lead it drafts the next step according to the `Plantillas`
   (templates) tab: channel and `delay_dias` (delay in days). A lead never has two pending
   messages at once.
3. **Sends.** It sends whatever is `aprobado` (approved) and due, respecting the sending
   window, daily caps and the per-run maximum.

It is idempotent: running it twice in a row does not duplicate messages.

### Rules that block a send

| Rule | Where it is configured |
|---|---|
| Mon–Fri only, 8:00–18:00 Bogotá time | `VENTANA` in `lib/config.ts` |
| Daily cap: 40 emails / 25 WhatsApp messages | `MAX_EMAIL_DIA`, `MAX_WA_DIA` |
| At most 6 sends per run (5 runs/day ≈ 30 max) | `MAX_POR_TICK` |
| Unresolved `{{...}}` variables → not sent, kept as a draft with a warning | `lib/guards.ts` |
| WhatsApp opt-in filter (off by default) | `EXIGIR_OPT_IN_WA` |
| Lead replies or asks to unsubscribe → sequence cancelled | `lib/scheduler.ts` |

If a step does not apply to a lead (no WhatsApp opt-in, no valid email), the engine skips
it and moves on to the next step instead of getting stuck.

---

## The Google Sheet

`npm run bootstrap` creates the 4 tabs with their headers. **The column order is a
contract**: if you change it in the Sheet, you must change it in `lib/repo.ts` too.

- **Leads** — `id, nombre, empresa, cargo, email, telefono, industria, contexto, fuente, estado, paso_actual, opt_in_whatsapp, ultimo_envio_at, creado_at, notas`
  (id, name, company, job title, email, phone, industry, context, source, status, current step,
  WhatsApp opt-in, last sent at, created at, notes)
  - `telefono` (phone): E.164 without the `+` → `573001234567`
  - `contexto` (context): the lead-specific hook. It is the only thing that keeps the message
    from feeling like a mass send, so it is worth filling in by hand.
  - `estado` (status): set it to `nuevo` (new) to start. The engine moves it to `en_secuencia`
    (in sequence) → `respondio` (replied) / `terminado` (finished) / `opt_out`.
- **Cola** (queue) — the generated messages and their status: `borrador` (draft), `aprobado`
  (approved), `enviado` (sent), `cancelado` (cancelled), `error`.
- **Eventos** (events) — an append-only log of everything that happened.
- **Plantillas** (templates) — the cadence: `paso, canal, delay_dias, asunto, cuerpo, wa_template, wa_idioma, activa`
  (step, channel, delay in days, subject, body, WhatsApp template, WhatsApp language, active)
  - `delay_dias` counts from when the previous step was sent.
  - Default cadence: **WhatsApp(0) → email(+2) → WhatsApp(+4) → email(+7)**. Two WhatsApp
    touches is the reasonable ceiling: the second template to someone who has not replied is
    where blocks start to happen.
  - Variables: `{{nombre}} {{primer_nombre}} {{empresa}} {{cargo}} {{industria}} {{contexto}}`
    (name, first name, company, job title, industry, context)
  - **For WhatsApp:** `asunto` = a readable preview of the template, and `cuerpo` = the Meta
    template parameters separated by `|`, in order: `{{primer_nombre}}|{{empresa}}`.

---

## Setup

### 1. Google Sheet + service account
Reuse an existing service account or create a new one in Google Cloud (with the Sheets API
enabled). Share the Sheet with the service account's email as **Editor**. Fill in
`SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.env.local`
(copy `.env.example`), then run:

```bash
npm run bootstrap
```

### 2. Gmail
In Google Cloud, create OAuth credentials of type **Desktop app**, with
`http://localhost:53682` as the redirect URI. Enable the Gmail API. Put
`GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` in `.env.local` and run:

```bash
npm run gmail-auth
```

Authorize in the browser and paste the `GMAIL_REFRESH_TOKEN` it prints.

### 3. WhatsApp Cloud API
1. A verified Meta Business account + a WhatsApp app → get `WA_PHONE_NUMBER_ID` and a
   permanent token (`WA_TOKEN`) from a system user, not the temporary 24-hour token.
2. Create the follow-up template and get it approved (MARKETING category). The approved name
   goes in the `wa_template` column. Approval takes 1 to 24 hours.
3. Webhook: `https://YOUR-DOMAIN/api/webhooks/whatsapp`, with `WA_VERIFY_TOKEN` as the
   verify token and the `messages` field subscribed. Without this, replies are not detected.

> **Phone number quality.** Meta requires opt-in by policy, but in practice the penalty comes
> from somewhere else: each number gets a *quality rating* that drops when people **block or
> report** you. In the red, your messaging tier is lowered; if it persists, the number is
> restricted. New numbers start at **250 business-initiated conversations per 24h** and move
> up to 1,000 / 10,000 depending on volume and quality.
>
> That is why, with WhatsApp as the opening channel:
> - Use a **dedicated number**, never your personal one. If it gets restricted, you do not
>   lose your own WhatsApp.
> - **Warm up the volume**: start at 20–30/day (`MAX_WA_DIA=25`) and increase gradually.
> - The template includes an **explicit opt-out**. The engine detects "baja", "stop" or
>   "no me escribás" (Spanish for "don't write to me") and marks the lead `opt_out`,
>   cancelling everything pending.
> - `EXIGIR_OPT_IN_WA=si` in `.env.local` switches to strict mode (only leads with
>   `opt_in_whatsapp = si`). It is set to `no` to allow cold outreach.
> - If your market includes the United States, first check the current status of marketing
>   templates sent to US numbers: Meta has paused them there before.

### 4. Local

```bash
npm run dev
```

`http://localhost:3002` is the approval inbox. To trigger the engine manually:

```bash
npm run tick -- --dry
```

`--dry` simulates everything (plans and computes sends) without writing or sending anything.
Remove `--dry` to run it for real.

### 5. Deploy to Vercel
Import the repo, paste every variable from `.env.example` into Environment Variables
(including a random `CRON_SECRET`) and deploy. `vercel.json` already schedules the cron every
2 hours from 8am to 4pm Bogotá time, Mon–Fri.

> Vercel's Hobby plan limits cron jobs to **1 run per day**. On Hobby, either upgrade to Pro
> or trigger `/api/cron` externally (cron-job.org, GitHub Actions) with the header
> `Authorization: Bearer $CRON_SECRET`.

---

## Daily operation

1. Paste new leads into the `Leads` tab with `estado = nuevo`.
2. On the next run, the step 1 drafts show up in the inbox.
3. Review them, edit if needed, and approve.
4. The rest of the sequence runs on its own until the lead replies or the steps run out.

## What's next

- Personalize step 1 with an LLM based on `contexto` (today it is a template + variables).
- Detect hard bounces in Gmail to mark the email address as invalid.
- Metrics: reply rate by step, by template and by industry.

## Automatic daily push

A launchd agent runs `scripts/daily-push.sh` once a day and pushes anything pending in this
repo to GitHub: it commits uncommitted changes as `wip: <date>` and pushes any commits that
are not on `origin` yet.

**Schedule: 17:00 system time.** This Mac is set to `America/Los_Angeles`, so 17:00 there is
**19:00 in Bogotá**, which is the intended time. If you change the machine's time zone, the
`Hour` in the `.plist` will be off and needs to be recalculated.

> **It drifts with daylight saving time.** Los Angeles changes its clocks; Bogotá does not.
> When the Pacific switches to PST (first Sunday of November), 17:00 there becomes 20:00 in
> Bogotá, so `Hour` must move to 16. In March, back to 17. For the same reason, the `wip:`
> commit is stamped with the Bogotá date, not the system date.

**If there is nothing to push, it does nothing.** It never creates empty commits: the
contribution graph reflects real work, not invented activity.

Before committing, it checks the names of the staged files and **aborts** if any of them
looks like a secret (`.env`, `.pem`, `*secret*`, `*credential*`, `client_secret`). This is a
safety net on top of `.gitignore`, because the script commits blindly.

```bash
tail -20 ~/Library/Logs/outreach-engine-daily-push.log   # what it did each day
launchctl print gui/$(id -u)/com.santiagoluengas.outreach-engine.daily-push
```

Operation:

```bash
# Run it now, exactly as launchd would
launchctl kickstart -k gui/$(id -u)/com.santiagoluengas.outreach-engine.daily-push

# Disable / re-enable it
launchctl bootout gui/$(id -u)/com.santiagoluengas.outreach-engine.daily-push
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.santiagoluengas.outreach-engine.daily-push.plist
```

### Git identity

For commits to count as contributions on GitHub, the author email must be linked to the
account. Without `user.email` set, git makes one up from the Mac's hostname
(`santiagoluengas@mac.lan`) and GitHub silently ignores those commits: they show up in the
repo but not on the profile.

It is set globally to GitHub's `noreply` address, which is always attributed correctly and
does not expose a real email when the repo is public:

```bash
git config --global user.email "114884733+santiagoluengas@users.noreply.github.com"
git var GIT_AUTHOR_IDENT   # check it
```

### Installing and changing it

The source of truth is `scripts/daily-push.sh`, but launchd **cannot run a script stored
inside `~/Downloads`** (it exits with code 126), so it is copied to `~/.local/bin/`. After
editing the script or the `.plist`, run:

```bash
npm run install-push    # copies both into place and reloads launchd
```

If you edit only the copy in `~/.local/bin/`, the change runs but is not versioned, and the
next `install-push` overwrites it.
