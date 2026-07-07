# Design — Read Proton Calendar in Gladys (ICS subscription via the CalDAV integration)

- **Date:** 2026-07-07
- **Branch:** `feature/proton-calendar`
- **Status:** Approved design, pending implementation plan

## 1. Problem & context

Users want their Proton Calendar events to appear in Gladys (full-page calendar view at
`front/src/routes/calendar`, plus scene triggers/actions like `CalendarEventIsComing` and
`CalendarIsEventRunning`).

**Key constraint:** Proton Calendar does **not** support CalDAV and has no public API — events are
end-to-end encrypted. The only supported external-read path is Proton's **"Share with anyone"
link** (Proton Calendar → calendar settings → *Share with anyone* → *Create link*, Limited/busy or
Full/details view). That link returns a read-only **iCalendar (ICS) feed**, refreshed by Proton
every ~8–16 h.

Therefore "reading Proton Calendar" = subscribing to that ICS URL and polling it — exactly the
**WEBCAL** pattern already present in the `caldav` service.

## 2. Chosen approach (Option B)

Extend the existing `server/services/caldav` integration rather than create a new service. Proton
is surfaced as a new "host" option in the Account tab's existing calendar-type `<select>`; behind
the scenes each Proton link becomes a `WEBCAL` calendar row synced by the existing
`syncUserWebcals` engine.

Decisions locked with the user:

1. **UI placement:** reuse the Account tab's calendar-type `<select>`; add a **Proton Calendar**
   option. When selected, the form collapses to a single **"Proton Calendar URL"** text input
   (username/password/SSL/CalDAV-URL fields hidden).
2. **View type:** whatever the feed contains; no special handling. Full view is the user's default
   in Proton. Limited (busy/free) feeds simply parse into events with generic titles.
3. **Sync cadence:** automatic every **1 hour**, plus **manual refresh**.
4. **Multiple calendars:** supported. Proton issues one share link per calendar. Add one URL at a
   time on the Account tab (name auto-read from the feed); all calendars are listed and managed
   (sync on/off + delete) on the existing **Sync** tab.

## 3. Data model

No migration required. Reuse `t_calendar` (`server/models/calendar.js`):

- `type = 'WEBCAL'`
- `external_id = <the Proton ICS URL>` (already unique)
- `service_id = <caldav service id>`
- `user_id = <owner>`
- `sync = true`
- `name` = from feed `X-WR-CALNAME`, fallback `'Proton Calendar'`
- `description`, `color` = sensible defaults (mirroring `formatCalendars`, e.g. color `#3174ad`)

Events are stored via the core calendar service exactly as existing WEBCAL calendars do.

## 4. Backend design (`server/services/caldav`)

### 4.1 `lib/calendar/calendar.addWebcal.js` — `addWebcal(userId, url)`
1. Validate `url` is present (`BadParameters('MISSING_PARAMETERS')` otherwise).
2. Reject if a calendar with the same `external_id` already exists for this user
   (`BadParameters('CALDAV_WEBCAL_ALREADY_EXISTS')`).
3. HTTP GET the URL via `this.gladys.http.request('get', url, null)`.
4. Parse with `this.ical.parseICS`. If it yields no calendar/VEVENT data (not a valid iCalendar
   body), throw `BadParameters('CALDAV_INVALID_WEBCAL_URL')`.
5. Derive the name from `X-WR-CALNAME` (regex over the raw ICS text is acceptable and robust with
   the `ical` 0.8.0 lib), fallback `'Proton Calendar'`.
6. Create the calendar row (`WEBCAL`, `sync: true`, fields per §3) via `gladys.calendar.create`.
7. Immediately sync its events by invoking the existing webcal sync path so events appear at once.
8. Return the created calendar.

### 4.2 `lib/calendar/calendar.destroyCalendar.js` — `destroyCalendar(selector)`
- `gladys.calendar.destroy(selector)` (removes the calendar and its events). Backs the Sync-tab
  delete button. Distinct from the existing `disableCalendar` (which only empties events but keeps
  the row).

### 4.3 Controller (`api/caldav.controller.js`)
- `POST /api/v1/service/caldav/webcal` → body `{ url }` → `addWebcal(req.user.id, url)`; returns the
  created calendar. Maps `CALDAV_INVALID_WEBCAL_URL` / `CALDAV_WEBCAL_ALREADY_EXISTS` /
  `MISSING_PARAMETERS` to 400 with the message code.
- `DELETE /api/v1/service/caldav/calendar/:selector` → `destroyCalendar(req.params.selector)`.
- Make the existing manual `GET /api/v1/service/caldav/sync` **tolerant**: run `syncUserCalendars`
  only when `CALDAV_URL` is configured for the user; always run `syncUserWebcals`. This lets a
  Proton-only user press "Sync now" without a CalDAV configuration error.

### 4.4 Interval (`index.js`)
- Change `webcalInterval` from `1000 * 60 * 60 * 12` (12 h) to `1000 * 60 * 60` (**1 h**). Applies
  to all WEBCAL calendars (intended).

### 4.5 Handler wiring (`lib/index.js`)
- Attach `addWebcal` and `destroyCalendar` to `CalDAVHandler.prototype` and expose the controller
  routes.

## 5. Front design

### 5.1 Account tab (`front/src/routes/integration/all/caldav/account-page/`)
- Add a `proton` key to the calendar-type `<select>` (populated from
  `integration.caldav.services`).
- When `caldavHost === 'proton'`, render **only** the "Proton Calendar URL" input + Save button;
  hide the CalDAV URL / username / password / SSL controls.
- `saveCaldavSettings` branches on host:
  - `proton`: `POST /api/v1/service/caldav/webcal` with `{ url: caldavUrl }`; on success show a
    success alert and clear the input; on `CALDAV_INVALID_WEBCAL_URL` /
    `CALDAV_WEBCAL_ALREADY_EXISTS` show the matching error string.
  - any other host: unchanged (saves `CALDAV_*` variables + calls `/config`).

### 5.2 Sync tab (`front/src/routes/integration/all/caldav/sync-page/`)
- The tab already lists every calendar with a sync toggle. Add a **delete (🗑) button per row** that
  calls `DELETE /api/v1/service/caldav/calendar/:selector` and refreshes the list.
- Proton calendars appear here automatically because they are `WEBCAL` rows.

### 5.3 i18n
- Add `integration.caldav.services.proton.*` (name, url label, urlInfo/help) and any new
  status/error strings to **every** `front/src/config/i18n/*.json` file. `compare-translations`
  (CI) requires all language files to share the same keys.

## 6. Error handling

| Situation | Behaviour |
|-----------|-----------|
| Empty/missing URL | 400 `MISSING_PARAMETERS` |
| URL not reachable / not valid iCalendar | 400 `CALDAV_INVALID_WEBCAL_URL` |
| URL already subscribed by this user | 400 `CALDAV_WEBCAL_ALREADY_EXISTS` |
| Feed has no `X-WR-CALNAME` | Default name `'Proton Calendar'` |
| Manual "Sync now" with no CalDAV config | Webcals still sync; no CalDAV error |

## 7. Testing

Server requires 100% patch coverage (Mocha + Chai + Sinon, tests under
`server/test/services/caldav/` mirroring source):

- `addWebcal`: valid URL (creates calendar + syncs), missing URL, invalid/unparseable feed,
  duplicate URL, feed missing `X-WR-CALNAME` (default name).
- `destroyCalendar`: removes calendar and events.
- Tolerant `/sync`: with and without `CALDAV_URL` configured.
- New controller routes: `POST /webcal`, `DELETE /calendar/:selector` (success + error mapping).

Existing `syncUserWebcals` tests continue to cover ongoing sync. Front is validated by eslint,
`compare-translations`, build, and (if routes/components changed) Cypress.

## 8. Out of scope (YAGNI)

- Writing back to Proton (feeds are read-only by design).
- Any Proton authentication / decryption (impossible without the ICS share link).
- A separate dedicated Proton service (explicitly rejected in favour of Option B).
- Real-time sync (Proton refreshes its own feed only every ~8–16 h).
