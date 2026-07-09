# Design: user time-format (12h / 24h) preference

Date: 2026-07-09

## Problem

Gladys has no way to choose between a 12-hour (AM/PM) and 24-hour clock. Today:

- The **clock box** formats time with dayjs localized tokens (`LT`/`LTS`), so 12h vs 24h is
  implicitly decided by the profile **language** locale (English → 12h, French/German → 24h).
- The **calendar box** hardcodes `HH:mm` and ignores the locale entirely, so event times are
  always 24h regardless of language.

There is no user/profile setting for clock format anywhere in the server or frontend.

## Goal

Add a single **global** user preference that all time-of-day widgets read, defaulting to
"follow the language locale" so existing behavior is preserved until a user opts in.

## Preference model

New column on `t_user`:

- `time_format` — `ENUM('auto', '12h', '24h')`, `allowNull: false`, `defaultValue: 'auto'`.
- Semantics:
  - `auto` → follow the language locale (dayjs `LT`/`LTS`). This is the default.
  - `12h` → force 12-hour with AM/PM.
  - `24h` → force 24-hour.

Modeled on the existing `temperature_unit_preference` / `distance_unit_preference` columns.

## Architecture

### Server

1. **Model** — `server/models/user.js`: add the `time_format` ENUM column (copy the
   `temperature_unit_preference` shape).
2. **Migration** — `server/migrations/20260709xxxxxx-add-user-time-format.js`:
   `addColumn('t_user', 'time_format', { type: Sequelize.ENUM('auto','12h','24h'), allowNull: false, defaultValue: 'auto' })`.
   `down` is a no-op, consistent with existing migrations.
3. **Read whitelist** — `server/lib/user/user.getById.js`: add `'time_format'` to the
   `attributes` array. **Required** — `GET /api/v1/me` uses this whitelist, so without it the
   field never reaches the frontend.
4. No change to the update path: `updateMySelf` → `gladys.user.update` passes the whole body
   through and Sequelize persists the known column.
5. **Constants** — add `TIME_FORMAT = { AUTO: 'auto', TWELVE_HOURS: '12h', TWENTY_FOUR_HOURS: '24h' }`
   and `TIME_FORMAT_LIST` to `server/utils/constants.js`, and use `TIME_FORMAT_LIST` for the model
   ENUM (matches the `AVAILABLE_LANGUAGES` precedent and keeps the values in one place).

### Frontend

1. **Shared helper (testable core)** — `front/src/utils/timeFormat.js`:

   ```js
   export function timeFormatToken(preference, { withSeconds = false } = {}) {
     if (preference === '12h') return withSeconds ? 'h:mm:ss A' : 'h:mm A';
     if (preference === '24h') return withSeconds ? 'HH:mm:ss' : 'HH:mm';
     return withSeconds ? 'LTS' : 'LT'; // 'auto' / undefined → locale
   }
   ```

   Pure function, no dayjs dependency; unit-tested in isolation.

2. **Clock box** — `Clock.jsx`: replace the fixed `LT`/`LTS` with
   `dayjs().locale(user.language).format(timeFormatToken(user.time_format, { withSeconds: displaySecond }))`.

3. **Calendar box** — format the event time with the same helper instead of the hardcoded
   `HH:mm`, honoring `user.time_format` and `user.language`. In `auto` this makes the calendar
   box follow the locale (consistent with the clock box) — a deliberate, minor behavior change:
   English-locale users see calendar times as 12h by default. The time formatting moves to where
   the `user` object is available (the box component / its render path) rather than staying in the
   locale-less `computeUpcoming` helper.

4. **Profile UI** — `front/src/components/user/profile.jsx`: add a "Time format" `<select>`
   (Automatic / 12-hour / 24-hour) next to the temperature/distance selectors, wired via a new
   `updateTimeFormat` handler in `front/src/routes/profile/index.js`
   (`updateNewUserProperty('time_format', value)`). `saveProfile` already PATCHes the whole
   `newUser`, so the field is sent automatically.

5. **i18n** — add `profile.timeFormatLabel`, `profile.timeFormatAuto`, `profile.timeFormat12h`,
   `profile.timeFormat24h` to `en.json`, `fr.json`, `de.json` (identical key paths).

Signup is intentionally out of scope: the `auto` default is the right behavior for new accounts.

## Data flow

Profile form → `updateNewUserProperty('time_format', …)` → `saveProfile` PATCH `/api/v1/me`
→ `updateMySelf` → `gladys.user.update` → DB. On read, `GET /api/v1/me` (`user.getById`, now
whitelisting `time_format`) → unistore `user` store → `props.user.time_format` in the clock and
calendar boxes → `timeFormatToken(...)`.

## Testing

- **Unit** — `timeFormatToken` covering `12h`, `24h`, `auto`/undefined, and the `withSeconds` variant.
- **Server** — extend the `user.getById` test to assert `time_format` is present in the returned
  object (guards the read-whitelist regression).
- Manual smoke: toggle the preference in the profile and confirm both the clock and calendar
  boxes switch format.

## Out of scope / non-goals

- Per-widget overrides (this is a single global preference).
- Signup-time selection.
- Changing any non-time-of-day date formatting (day labels, chart axes remain as-is).
