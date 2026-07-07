# Calendar Upcoming-Events Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard box that shows the user's next upcoming event (time + title) and a short list of today's remaining events, color-coded across all their calendars.

**Architecture:** A new front-end dashboard box type `calendar`, following the existing box pattern (`weather`/`clock`). It reuses the existing `GET /api/v1/calendar/event?from=&to=` + `GET /api/v1/calendar` endpoints (no new backend logic), computes "next"/"today" client-side via a pure helper, and refreshes every 5 minutes. The only backend change is registering the box type in `server/utils/constants.js`.

**Tech Stack:** Preact + unistore, `dayjs`, `preact-i18n`, i18n JSON (en/fr/de).

## Global Constraints

- i18n: `en.json`, `fr.json`, `de.json` MUST share identical keys (`npm run compare-translations` enforces). Every new key in all three.
- Front ESLint (airbnb-based) lints `src/`; **no nested ternaries** (`no-nested-ternary`); `npm run build` must succeed (front scripts already set `NODE_OPTIONS=--openssl-legacy-provider`).
- Front has **no unit-test runner** — validation is `eslint` + `compare-translations` + `build` + live manual verification.
- No new backend endpoint. Reuse `GET /api/v1/calendar/event` (query `from`, `to`, `shared`) and `GET /api/v1/calendar` (calendars with `color`). Events carry `name`, `start`, `end`, `full_day`, `calendar_id`.
- Box config values are stored on the box object and edited via `updateBoxConfig(x, y, {...})`; box data/status live under `DASHBOARD_BOX_DATA_KEY`/`DASHBOARD_BOX_STATUS_KEY` keyed `Calendar.${x}_${y}`.
- Do not commit build artifacts (`front/size-plugin.json`) or test databases.

---

### Task 1: Pure event-selection helper

**Files:**
- Create: `front/src/components/boxs/calendar/computeUpcoming.js`

**Interfaces:**
- Produces: `computeUpcoming(events, now, options)` → `{ status: 'ok'|'empty', next: object|null, today: object[], moreCount: number }`; `describeEventTime(event, now)` → `{ ongoing: boolean, allDay: boolean, startsToday: boolean, startsTomorrow: boolean, time: string }`; `DEFAULT_MAX_TODAY = 5`.

- [ ] **Step 1: Write the helper**

Create `front/src/components/boxs/calendar/computeUpcoming.js`:

```js
import dayjs from 'dayjs';

export const DEFAULT_MAX_TODAY = 5;

/**
 * @description Select the next not-yet-ended event and today's remaining events.
 * @param {Array} events - Events with { start, end, full_day, ... }, unsorted.
 * @param {(Date|string|number)} now - Current time.
 * @param {object} [options] - Options, { maxToday }.
 * @returns {object} { status, next, today, moreCount }.
 * @example
 * computeUpcoming(events, new Date());
 */
export function computeUpcoming(events, now, options = {}) {
  const maxToday = options.maxToday || DEFAULT_MAX_TODAY;
  const nowD = dayjs(now);

  const upcoming = (events || [])
    .filter(event => {
      const end = event.end ? dayjs(event.end) : dayjs(event.start);
      return !end.isBefore(nowD);
    })
    .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf());

  if (upcoming.length === 0) {
    return { status: 'empty', next: null, today: [], moreCount: 0 };
  }

  const [next, ...rest] = upcoming;
  const todayEvents = rest.filter(event => dayjs(event.start).isSame(nowD, 'day'));
  const today = todayEvents.slice(0, maxToday);
  const moreCount = todayEvents.length - today.length;

  return { status: 'ok', next, today, moreCount };
}

/**
 * @description Describe how to render an event's time.
 * @param {object} event - Event with { start, end, full_day }.
 * @param {(Date|string|number)} now - Current time.
 * @returns {object} { ongoing, allDay, startsToday, startsTomorrow, time }.
 * @example
 * describeEventTime(event, new Date());
 */
export function describeEventTime(event, now) {
  const start = dayjs(event.start);
  const end = event.end ? dayjs(event.end) : start;
  const nowD = dayjs(now);
  return {
    ongoing: !start.isAfter(nowD) && end.isAfter(nowD),
    allDay: Boolean(event.full_day),
    startsToday: start.isSame(nowD, 'day'),
    startsTomorrow: start.isSame(nowD.add(1, 'day'), 'day'),
    time: start.format('HH:mm')
  };
}
```

Note: `isSame(date, 'day')`, `isBefore`, `isAfter`, `add`, `startOf` are all core dayjs — no plugin needed.

- [ ] **Step 2: Lint**

Run: `cd front && npm run eslint 2>&1 | tail -5`
Expected: 0 errors (pre-existing warnings elsewhere are fine).

- [ ] **Step 3: Commit**

```bash
git add front/src/components/boxs/calendar/computeUpcoming.js
git commit -m "feat(dashboard): add pure computeUpcoming helper for calendar widget"
```

---

### Task 2: i18n strings (en/fr/de)

**Files:**
- Modify: `front/src/config/i18n/en.json`, `fr.json`, `de.json`

**Interfaces:**
- Produces keys: `dashboard.boxTitle.calendar`; under `dashboard.boxes.calendar`: `next`, `now`, `today`, `allDay`, `tomorrow`, `noMoreEventsToday`, `noUpcomingEvents`, `moreEvents`, `error`, `eventsToShowLabel`.

- [ ] **Step 1: Add the box title + strings to en.json**

In `front/src/config/i18n/en.json`, add `"calendar": "Calendar"` to the `dashboard.boxTitle` object, and add this object under `dashboard.boxes` (alongside `clock`, `weather`, etc.):

```json
"calendar": {
  "next": "Next",
  "now": "Now",
  "today": "Today",
  "allDay": "All day",
  "tomorrow": "Tomorrow",
  "noMoreEventsToday": "No more events today",
  "noUpcomingEvents": "No upcoming events",
  "moreEvents": "+{{count}} more",
  "error": "Unable to load your calendar events.",
  "eventsToShowLabel": "Number of events to show"
}
```

- [ ] **Step 2: Add the same keys to fr.json**

`dashboard.boxTitle.calendar`: `"Agenda"`. Under `dashboard.boxes`:

```json
"calendar": {
  "next": "Prochain",
  "now": "En cours",
  "today": "Aujourd'hui",
  "allDay": "Toute la journée",
  "tomorrow": "Demain",
  "noMoreEventsToday": "Plus d'événement aujourd'hui",
  "noUpcomingEvents": "Aucun événement à venir",
  "moreEvents": "+{{count}} de plus",
  "error": "Impossible de charger les événements de votre agenda.",
  "eventsToShowLabel": "Nombre d'événements à afficher"
}
```

- [ ] **Step 3: Add the same keys to de.json**

`dashboard.boxTitle.calendar`: `"Kalender"`. Under `dashboard.boxes`:

```json
"calendar": {
  "next": "Nächster",
  "now": "Jetzt",
  "today": "Heute",
  "allDay": "Ganztägig",
  "tomorrow": "Morgen",
  "noMoreEventsToday": "Keine weiteren Termine heute",
  "noUpcomingEvents": "Keine bevorstehenden Termine",
  "moreEvents": "+{{count}} weitere",
  "error": "Kalendertermine konnten nicht geladen werden.",
  "eventsToShowLabel": "Anzahl der anzuzeigenden Termine"
}
```

- [ ] **Step 4: Validate parity + lint**

Run: `cd front && npm run compare-translations 2>&1 | tail -5`
Expected: "No errors found".

- [ ] **Step 5: Commit**

```bash
git add front/src/config/i18n/en.json front/src/config/i18n/fr.json front/src/config/i18n/de.json
git commit -m "feat(dashboard): i18n strings for calendar widget"
```

---

### Task 3: Box data-fetching action

**Files:**
- Create: `front/src/actions/dashboard/boxes/calendar.js`

**Interfaces:**
- Consumes: `computeUpcoming` (Task 1); `createBoxActions` from `../boxActions` (existing: `updateBoxStatus(state,key,x,y,status)`, `mergeBoxData(state,key,x,y,data)`); `state.httpClient.get`.
- Produces: default-exported `createActions(store)` exposing `getCalendarEvents(state, box, x, y)`; stores `{ upcoming }` under box data key `Calendar`.

- [ ] **Step 1: Write the action**

Create `front/src/actions/dashboard/boxes/calendar.js`:

```js
import dayjs from 'dayjs';
import get from 'get-value';
import { RequestStatus } from '../../../utils/consts';
import createBoxActions from '../boxActions';
import { computeUpcoming } from '../../../components/boxs/calendar/computeUpcoming';

const BOX_KEY = 'Calendar';
const LOOKAHEAD_DAYS = 31;

function createActions(store) {
  const boxActions = createBoxActions(store);

  const actions = {
    async getCalendarEvents(state, box, x, y) {
      boxActions.updateBoxStatus(state, BOX_KEY, x, y, RequestStatus.Getting);
      try {
        const now = dayjs();
        const from = now.startOf('day').toISOString();
        const to = now.add(LOOKAHEAD_DAYS, 'day').toISOString();

        const events = await state.httpClient.get('/api/v1/calendar/event', {
          from,
          to,
          shared: true
        });
        const calendars = await state.httpClient.get('/api/v1/calendar');
        const colorByCalendarId = {};
        calendars.forEach(calendar => {
          colorByCalendarId[calendar.id] = calendar.color;
        });
        const eventsWithColor = events.map(event => ({
          ...event,
          color: colorByCalendarId[event.calendar_id]
        }));

        const maxToday = get(box, 'calendar_max_events') || undefined;
        const upcoming = computeUpcoming(eventsWithColor, now.toDate(), { maxToday });

        boxActions.mergeBoxData(state, BOX_KEY, x, y, { upcoming });
        boxActions.updateBoxStatus(state, BOX_KEY, x, y, RequestStatus.Success);
      } catch (e) {
        console.error(e);
        boxActions.updateBoxStatus(state, BOX_KEY, x, y, RequestStatus.Error);
      }
    }
  };
  return Object.assign({}, actions);
}

export default createActions;
```

- [ ] **Step 2: Lint**

Run: `cd front && npm run eslint 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add front/src/actions/dashboard/boxes/calendar.js
git commit -m "feat(dashboard): calendar widget data-fetching action"
```

---

### Task 4: Box view + styles

**Files:**
- Create: `front/src/components/boxs/calendar/CalendarBox.jsx`
- Create: `front/src/components/boxs/calendar/style.css`

**Interfaces:**
- Consumes: `describeEventTime` (Task 1); action default export (Task 3); i18n keys (Task 2); `RequestStatus`, `DASHBOARD_BOX_DATA_KEY`, `DASHBOARD_BOX_STATUS_KEY` from `../../../utils/consts`.
- Produces: default-exported connected component (used by `Box.jsx` in Task 6). Connects to `DashboardBoxDataCalendar,DashboardBoxStatusCalendar,user`.

- [ ] **Step 1: Write style.css**

Create `front/src/components/boxs/calendar/style.css`:

```css
.sectionLabel {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9aa4ad;
  margin: 6px 0 2px;
}

.eventRow {
  display: flex;
  align-items: baseline;
  padding: 3px 0;
}

.eventRowLarge {
  padding: 4px 0;
  font-size: 16px;
}

.eventDot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  align-self: center;
}

.eventTime {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: #495057;
  margin-right: 8px;
  white-space: nowrap;
}

.eventDay {
  color: #9aa4ad;
}

.eventName {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moreLink {
  display: inline-block;
  margin-top: 4px;
  font-size: 13px;
}
```

- [ ] **Step 2: Write CalendarBox.jsx**

Create `front/src/components/boxs/calendar/CalendarBox.jsx`:

```jsx
import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text } from 'preact-i18n';
import { Link } from 'preact-router/match';
import dayjs from 'dayjs';
import cx from 'classnames';
import get from 'get-value';

import actions from '../../../actions/dashboard/boxes/calendar';
import { describeEventTime } from './computeUpcoming';
import { RequestStatus, DASHBOARD_BOX_DATA_KEY, DASHBOARD_BOX_STATUS_KEY } from '../../../utils/consts';
import style from './style.css';

const BOX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CALENDAR_ROUTE = '/dashboard/calendar';
const DEFAULT_COLOR = '#3174ad';

function toEventView(event, now, language) {
  const desc = describeEventTime(event, now);
  let dayLabel = null;
  if (!desc.ongoing && !desc.startsToday && !desc.startsTomorrow) {
    dayLabel = dayjs(event.start)
      .locale(language)
      .format('ddd D MMM');
  }
  return {
    name: event.name,
    color: event.color || DEFAULT_COLOR,
    ongoing: desc.ongoing,
    allDay: desc.allDay,
    startsTomorrow: desc.startsTomorrow && !desc.ongoing,
    dayLabel,
    time: desc.time
  };
}

const EventTime = ({ view }) => {
  if (view.ongoing) {
    return <Text id="dashboard.boxes.calendar.now" />;
  }
  if (view.allDay) {
    return <Text id="dashboard.boxes.calendar.allDay" />;
  }
  return (
    <span>
      {view.startsTomorrow && (
        <span class={style.eventDay}>
          <Text id="dashboard.boxes.calendar.tomorrow" />{' '}
        </span>
      )}
      {view.dayLabel && <span class={style.eventDay}>{view.dayLabel} </span>}
      {view.time}
    </span>
  );
};

const EventRow = ({ view, large }) => (
  <div class={cx(style.eventRow, { [style.eventRowLarge]: large })}>
    <span class={style.eventDot} style={{ backgroundColor: view.color }} />
    <span class={style.eventTime}>
      <EventTime view={view} />
    </span>
    <span class={style.eventName}>{view.name}</span>
  </div>
);

const CalendarBox = ({ boxTitle, boxStatus, status, nextView, todayViews, moreCount }) => (
  <div class="card">
    <div class="card-header">
      <Link href={CALENDAR_ROUTE} class="card-title">
        {boxTitle || <Text id="dashboard.boxTitle.calendar" />}
      </Link>
    </div>
    <div class="card-body">
      {boxStatus === RequestStatus.Error && (
        <p class="alert alert-danger">
          <Text id="dashboard.boxes.calendar.error" />
        </p>
      )}
      {boxStatus !== RequestStatus.Error && status === 'empty' && (
        <p class="text-muted mb-0">
          <Text id="dashboard.boxes.calendar.noUpcomingEvents" />
        </p>
      )}
      {boxStatus !== RequestStatus.Error && status === 'ok' && (
        <div>
          <div class={style.sectionLabel}>
            <Text id="dashboard.boxes.calendar.next" />
          </div>
          {nextView && <EventRow view={nextView} large />}
          <div class={style.sectionLabel}>
            <Text id="dashboard.boxes.calendar.today" />
          </div>
          {todayViews.length === 0 && (
            <p class="text-muted mb-0">
              <Text id="dashboard.boxes.calendar.noMoreEventsToday" />
            </p>
          )}
          {todayViews.map(view => (
            <EventRow view={view} />
          ))}
          {moreCount > 0 && (
            <Link href={CALENDAR_ROUTE} class={style.moreLink}>
              <Text id="dashboard.boxes.calendar.moreEvents" fields={{ count: moreCount }} />
            </Link>
          )}
        </div>
      )}
    </div>
  </div>
);

class CalendarBoxComponent extends Component {
  refreshData = () => {
    this.props.getCalendarEvents(this.props.box, this.props.x, this.props.y);
  };

  componentDidMount() {
    this.refreshData();
    this.interval = setInterval(this.refreshData, BOX_REFRESH_INTERVAL_MS);
  }

  componentDidUpdate(previousProps) {
    if (get(previousProps, 'box.calendar_max_events') !== get(this.props, 'box.calendar_max_events')) {
      this.refreshData();
    }
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render(props) {
    const boxData = get(props, `${DASHBOARD_BOX_DATA_KEY}Calendar.${props.x}_${props.y}`);
    const boxStatus = get(props, `${DASHBOARD_BOX_STATUS_KEY}Calendar.${props.x}_${props.y}`);
    const upcoming = get(boxData, 'upcoming');
    const language = get(props, 'user.language');
    const now = new Date();

    const nextEvent = get(upcoming, 'next');
    const nextView = nextEvent ? toEventView(nextEvent, now, language) : null;
    const todayViews = (get(upcoming, 'today') || []).map(event => toEventView(event, now, language));

    return (
      <CalendarBox
        boxTitle={props.box.title}
        boxStatus={boxStatus}
        status={get(upcoming, 'status')}
        nextView={nextView}
        todayViews={todayViews}
        moreCount={get(upcoming, 'moreCount') || 0}
      />
    );
  }
}

export default connect('DashboardBoxDataCalendar,DashboardBoxStatusCalendar,user', actions)(CalendarBoxComponent);
```

- [ ] **Step 3: Lint**

Run: `cd front && npm run eslint 2>&1 | tail -5`
Expected: 0 errors (in particular, no `no-nested-ternary`).

- [ ] **Step 4: Commit**

```bash
git add front/src/components/boxs/calendar/CalendarBox.jsx front/src/components/boxs/calendar/style.css
git commit -m "feat(dashboard): calendar widget view and styles"
```

---

### Task 5: Box config (edit) component

**Files:**
- Create: `front/src/components/boxs/calendar/EditCalendar.jsx`

**Interfaces:**
- Consumes: `BaseEditBox` from `../baseEditBox`; `updateBoxConfig(x, y, data)` (provided to edit boxes); i18n `dashboard.boxTitle.calendar`, `dashboard.boxes.calendar.eventsToShowLabel`.
- Produces: default-exported connected component (used by `EditBox.jsx` in Task 6); writes `box.calendar_max_events` (number).

- [ ] **Step 1: Write EditCalendar.jsx**

Create `front/src/components/boxs/calendar/EditCalendar.jsx`:

```jsx
import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text } from 'preact-i18n';
import BaseEditBox from '../baseEditBox';

class EditCalendar extends Component {
  updateMaxEvents = e => {
    this.props.updateBoxConfig(this.props.x, this.props.y, { calendar_max_events: Number(e.target.value) });
  };

  render(props) {
    return (
      <BaseEditBox {...props} titleKey="dashboard.boxTitle.calendar">
        <div class="form-group">
          <label>
            <Text id="dashboard.boxes.calendar.eventsToShowLabel" />
          </label>
          <input
            type="number"
            min="1"
            max="20"
            class="form-control"
            value={props.box.calendar_max_events || 5}
            onInput={this.updateMaxEvents}
          />
        </div>
      </BaseEditBox>
    );
  }
}

export default connect('', {})(EditCalendar);
```

- [ ] **Step 2: Lint**

Run: `cd front && npm run eslint 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add front/src/components/boxs/calendar/EditCalendar.jsx
git commit -m "feat(dashboard): calendar widget edit/config component"
```

---

### Task 6: Register the box type end-to-end

**Files:**
- Modify: `server/utils/constants.js` (add to `DASHBOARD_BOX_TYPE`)
- Modify: `front/src/routes/dashboard/Box.jsx` (view mapping)
- Modify: `front/src/routes/dashboard/edit-dashboard/EditBox.jsx` (edit mapping)

**Interfaces:**
- Consumes: `CalendarBox` (Task 4), `EditCalendar` (Task 5).
- Produces: box type `'calendar'` selectable in the dashboard editor and rendered on dashboards.

- [ ] **Step 1: Register the box type constant**

In `server/utils/constants.js`, add to the `DASHBOARD_BOX_TYPE` object (after `LINK: 'link',`):

```js
  CALENDAR: 'calendar',
```

- [ ] **Step 2: Register the view component**

In `front/src/routes/dashboard/Box.jsx`, add the import (with the other box imports):

```js
import CalendarBox from '../../components/boxs/calendar/CalendarBox';
```

and add a case in the `switch` (e.g. after the `link` case):

```js
    case 'calendar':
      return <CalendarBox {...props} />;
```

- [ ] **Step 3: Register the edit component**

In `front/src/routes/dashboard/edit-dashboard/EditBox.jsx`, add the import:

```js
import EditCalendar from '../../../components/boxs/calendar/EditCalendar';
```

and add a case before the `default:` case:

```js
    case 'calendar':
      return <EditCalendar {...props} />;
```

- [ ] **Step 4: Lint both dirs**

Run: `cd front && npm run eslint 2>&1 | tail -5` (expect 0 errors)
Run: `cd server && npm run prettier && npm run eslint 2>&1 | tail -5` (expect clean; if prettier/eslint modified any file OUTSIDE `server/utils/constants.js`, revert it with `git checkout -- <file>`)

- [ ] **Step 5: Build the front + verify translations**

Run: `cd front && npm run compare-translations && npm run build 2>&1 | tail -15`
Expected: compare-translations "No errors found"; build exits 0. Then remove the build artifact if present: `rm -f front/size-plugin.json`.

- [ ] **Step 6: Commit**

```bash
git add server/utils/constants.js front/src/routes/dashboard/Box.jsx front/src/routes/dashboard/edit-dashboard/EditBox.jsx
git commit -m "feat(dashboard): register calendar box type"
```

---

### Task 7: Live end-to-end verification

**Files:** none (verification only).

**Prerequisite:** dev servers running (`cd server && npm start` on :1443; `cd front && npm start` on :1444). A signed-in account exists (complete onboarding at http://localhost:1444 if the DB is fresh).

- [ ] **Step 1: Seed test data**

Using the UI (Integrations → CalDAV → add a public ICS URL) OR the REST API with a session token, ensure there is at least one calendar with several events: one **ongoing now**, one **later today**, one **tomorrow**, one **>5 later today** (to exercise "+N more"), and be able to remove all of today's to test the empty/"future day" case. (API: `POST /api/v1/calendar` to create a calendar, then `POST /api/v1/calendar/:selector/event` per event with `name`, `start`, `end`, `full_day`.)

- [ ] **Step 2: Add the widget to a dashboard**

At http://localhost:1444 → a dashboard → edit → add box → select **"Calendar"**. Save.

- [ ] **Step 3: Verify each case (look at the rendered box)**

Confirm:
1. **Next** shows the closest not-yet-ended event with a colored dot, correct time (or "Now" if ongoing, "All day" for a full-day event).
2. **Today** lists the remaining events for today (excluding the one shown as Next), each with its calendar color.
3. With >5 today events, a "**+N more**" link appears and points to `/dashboard/calendar`.
4. When no events remain today but a future event exists, Next shows it with a day label (e.g. "Tomorrow 09:00") and the Today section shows "No more events today".
5. With no upcoming events at all, the box shows "No upcoming events".
6. The header title links to `/dashboard/calendar`.
7. Editing the box's "Number of events to show" changes the today-list cap.

- [ ] **Step 4: Final checks (CI mirror)**

Run:
```bash
cd front && npm run prettier-check && npm run eslint && npm run compare-translations && npm run build
cd ../server && npm run prettier-check && npm run eslint
```
Expected: all green (ignore the known pre-existing `formaters.test.js` timezone failures if running the server test suite — unrelated to this feature). Remove `front/size-plugin.json` if the build regenerated it.

---

## Self-Review

- **Spec coverage:** §3 architecture (reuse endpoints, box type, 5-min refresh, 31-day window, start-of-day fetch) → Tasks 3 + 6. §4 behavior (next not-yet-ended across days, Now/All-day/date labels, today excluding next, cap+more, empty states) → Tasks 1 (selection) + 4 (rendering). §5 files → Tasks 1–6 (all listed files covered). §6 i18n → Task 2. §7 error handling (RequestStatus.Error alert, missing `end` → `end=start`) → Tasks 3 + 4 + 1. §8 testing (eslint/compare-translations/build + live) → each task + Task 7. §9 out-of-scope respected (no filter UI beyond count, read-only, no new endpoint).
- **Placeholder scan:** none — every step has full code.
- **Type consistency:** `computeUpcoming`/`describeEventTime` signatures and return shape (`{status,next,today,moreCount}`) match between Task 1, the action (Task 3), and the view (Task 4). Box data key `Calendar`, config field `calendar_max_events`, and box type string `'calendar'` are consistent across Tasks 3–6. Action export name `getCalendarEvents` matches its use in Task 4's `refreshData`.
