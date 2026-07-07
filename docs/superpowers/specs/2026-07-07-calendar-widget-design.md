# Design — Calendar "upcoming events" dashboard widget

- **Date:** 2026-07-07
- **Branch:** `feature/calendar-event-widget`
- **Status:** Approved design, pending implementation plan

## 1. Purpose

A dashboard box that shows, at a glance, the user's **next upcoming event** (time + title) and a short list of the **rest of today's events**, across all their calendars (Proton, CalDAV, etc.). Complements the existing full-page `/calendar` view with a compact widget.

## 2. Decisions (locked with the user)

1. **Content:** prominent "Next" event (colored dot + time + title) at top, then a short list of today's remaining events. Count is implicit from the list.
2. **Time window:** "Next" = closest event **not yet ended**, looking ahead **across days** — if nothing is left today it shows the next future event with its date. "Today" list = today's not-yet-ended events **excluding** the one shown as Next. Past (ended) events are never shown.
3. **Calendars:** combine **all** the user's calendars; show a small colored dot per event using each calendar's color. No calendar-filter config.
4. **Horizon / refresh / cap / link:** look-ahead window 31 days; auto-refresh every 5 minutes; today list capped at 5 with "+N more"; box header links to `/calendar`.

## 3. Architecture & data flow

New dashboard box **type `calendar`**, following the existing box pattern (`weather`, `clock`).

- **No new backend endpoint.** Reuse `GET /api/v1/calendar/event?from=<ISO>&to=<ISO>`, which returns events across all the user's calendars, each including `calendar.name`, `calendar.selector`, and color. (`server/lib/calendar/calendar.getEvents.js` filters by `start` in `[from, to]` and joins the calendar; it does **not** sort, so ordering is done client-side.)
- Only backend change: register the type by adding `calendar: 'calendar'` to `DASHBOARD_BOX_TYPE` in `server/utils/constants.js` (consumed by the front via `DASHBOARD_BOX_TYPE_LIST`).
- The box's unistore action fetches events for **`from` = start of today (local)**, **`to` = now + 31 days**, then computes everything client-side. Fetching from start-of-today (not `now`) so an **ongoing** event (started earlier, not yet ended) is included.
- **Auto-refresh every 5 minutes** so "Next" rolls over as events pass (same interval mechanism as the weather box).
- Data/status stored under `DASHBOARD_BOX_DATA_KEY` / `DASHBOARD_BOX_STATUS_KEY` keyed by the box position, matching the existing box convention.

## 4. Widget behavior (core logic)

From the fetched events, keep those **not yet ended** (`end >= now`), sorted by `start` ascending. `end` falls back to `start` when absent; all-day events use their date span.

- **Next** = first such event. Render: calendar-color dot, time, title.
  - Ongoing (`start <= now < end`) → label **"Now"**.
  - Starts today → time only (`14:30`).
  - Starts a future day → time + date (e.g. `Tomorrow 09:00`, otherwise a short date like `Mon 9 Aug`).
  - **All-day** event (`full_day === true`) → show **"All day"** instead of a time.
- **Today** = the remaining not-yet-ended events whose `start` is **today (local)**, **excluding** the event shown as Next. Rendered as a short list (dot + time + title), capped at **5**; if more, a "**+N more**" line links to `/calendar`.
  - If Next is on a future day (nothing left today) → this section shows "**No more events today**".
- **Empty state:** no not-yet-ended events in the 31-day window → "**No upcoming events**".
- The box **header/title links to `/calendar`**.

Times are rendered in the browser's local timezone via `dayjs` (events carry tz-aware ISO strings), consistent with the existing `/calendar` route.

## 5. Files & components

**Backend**
- `server/utils/constants.js` — add `calendar: 'calendar'` to `DASHBOARD_BOX_TYPE`.

**Front**
- `front/src/components/boxs/calendar/CalendarBox.jsx` — the view: Next block, Today list, and the empty/error states.
- `front/src/components/boxs/calendar/EditCalendar.jsx` — minimal config via `BaseEditBox`: optional box **title** and an **"events to show"** number (default 5). No calendar filter.
- `front/src/components/boxs/calendar/style.css` — box styles.
- `front/src/actions/dashboard/boxes/calendar.js` — unistore action: fetch events for the window, compute `next` + `today` list, store under the box data/status keys; expose a refresh used on mount and on the 5-minute interval.
- `front/src/routes/dashboard/Box.jsx` — import `CalendarBox`, add `case 'calendar'`.
- `front/src/routes/dashboard/edit-dashboard/EditBox.jsx` — import `EditCalendar`, add `case 'calendar'`.
- `front/src/config/i18n/en.json`, `fr.json`, `de.json` — new strings (below).

## 6. i18n

Add to all three locale files (compare-translations requires identical keys):
- `dashboard.boxTitle.calendar` — box name in the type picker and header.
- `dashboard.boxes.calendar.next` ("Next"), `.now` ("Now"), `.today` ("Today"), `.allDay` ("All day"), `.noMoreEventsToday` ("No more events today"), `.noUpcomingEvents` ("No upcoming events"), `.moreEvents` ("+{count} more" — pluralized/interpolated per existing i18n conventions), and any EditCalendar labels (`.eventsToShowLabel`, title label reused from existing dashboard keys where available).

## 7. Error handling

- Fetch failure → the box renders an error state consistent with other boxes' `RequestStatus.Error` handling (an alert inside the card).
- Empty results → the "No upcoming events" state (§4), not an error.
- Missing `end` on an event → treat `end = start` for the not-yet-ended filter.

## 8. Testing

- The front has **no unit-test runner** (Cypress is E2E only). Validation: `npm run eslint`, `npm run compare-translations`, `npm run build`, plus **manual/live verification** in the running app covering: next-today, next-future-day (today empty), all-day event, ongoing ("Now") event, >5 events ("+N more"), and the no-upcoming-events empty state.
- Backend change is a single constant addition; it is exercised by any test that loads `constants.js` (patch coverage satisfied on load). No new server logic.
- CI Cypress covers dashboard rendering broadly; adding the box must not break existing dashboard specs.

## 9. Out of scope (YAGNI)

- Per-calendar filtering / calendar selection UI.
- Creating, editing, or deleting events from the widget (read-only).
- Multi-day agenda beyond "next + today".
- A new backend endpoint or "next event" server helper (client-side computation over the existing range endpoint is sufficient).
