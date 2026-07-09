# User time-format (12h/24h) preference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global `time_format` user preference (`auto`/`12h`/`24h`, default `auto`) that the clock and calendar dashboard boxes read to render times.

**Architecture:** A new `t_user.time_format` ENUM column (server model + migration), exposed through `GET /api/v1/me`. The frontend adds a pure `timeFormatToken(preference, { withSeconds })` helper that both boxes use to pick a dayjs format token (`auto` → locale `LT`/`LTS`). A profile-page `<select>` writes the preference.

**Tech Stack:** Node + Sequelize (SQLite) + Umzug migrations + Mocha/Chai (server); Preact + unistore + dayjs + preact-i18n (frontend). Frontend has **no unit-test runner** — frontend verification is `eslint`, `prettier --check`, `compare-translations`, an ad-hoc `node` evaluation of the pure helper, and a production build.

## Global Constraints

- Enum values are exactly `'auto'`, `'12h'`, `'24h'`; default `'auto'`.
- `auto` means "follow the language locale" (dayjs `LT`/`LTS`).
- i18n keys must be added to **all three** files (`en.json`, `fr.json`, `de.json`) with identical key paths or `npm run compare-translations` fails.
- Follow existing precedent: the column mirrors `temperature_unit_preference` (inline `DataTypes.ENUM`, no new `constants.js` entry — a deliberate simplification of the spec's optional constant).
- Migration filename prefix must sort after `20260629180000`.
- Run server tests with: `cd server && NODE_ENV=test SQLITE_FILE_PATH=/tmp/gladys-test.db ./node_modules/.bin/mocha --require ./test/setup-env.js --recursive ./test/bootstrap.test.js "<glob>" --exit`

---

### Task 1: Server — add `time_format` column, expose via `getById`, fix fixtures

**Files:**
- Create: `server/migrations/20260709120000-add-user-time-format.js`
- Modify: `server/models/user.js` (after the `distance_unit_preference` block, ~line 84)
- Modify: `server/lib/user/user.getById.js:15-28` (attributes array)
- Test: `server/test/lib/user/user.getById.test.js:9-22`
- Test (fixtures rippled by the new column): `server/test/controllers/user/user.getMySelf.test.js`, `server/test/lib/user/user.getBySelector.test.js`, `server/test/controllers/user/user.getBySelector.test.js`, `server/test/lib/user/user.updateBySelector.test.js`

**Interfaces:**
- Produces: `t_user.time_format` column; `gladys.user.getById(id)` returns an object that now includes `time_format: 'auto'`. `GET /api/v1/me` response includes `time_format`.

- [ ] **Step 1: Write the failing test** — add `time_format` to the expected object in `server/test/lib/user/user.getById.test.js`. Change the `expect(userFound).to.deep.equal({ ... })` block (lines 9-22) to include the new key:

```js
    expect(userFound).to.deep.equal({
      id: '0cd30aef-9c4e-4a23-88e3-3547971296e5',
      firstname: 'John',
      lastname: 'Doe',
      selector: 'john',
      email: 'demo@demo.com',
      language: 'en',
      birthdate: '12/12/1990',
      temperature_unit_preference: 'celsius',
      distance_unit_preference: 'metric',
      time_format: 'auto',
      role: 'admin',
      created_at: new Date('2019-02-12T07:49:07.556Z'),
      updated_at: new Date('2019-02-12T07:49:07.556Z'),
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && NODE_ENV=test SQLITE_FILE_PATH=/tmp/gladys-test.db ./node_modules/.bin/mocha --require ./test/setup-env.js --recursive ./test/bootstrap.test.js "./test/lib/user/user.getById.test.js" --exit`
Expected: FAIL — the returned object is missing `time_format` (deep-equal mismatch).

- [ ] **Step 3: Create the migration** — `server/migrations/20260709120000-add-user-time-format.js`:

```js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('t_user', 'time_format', {
      type: Sequelize.ENUM('auto', '12h', '24h'),
      allowNull: false,
      defaultValue: 'auto',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('t_user', 'time_format');
  },
};
```

- [ ] **Step 4: Add the model column** — in `server/models/user.js`, immediately after the `distance_unit_preference` block (the block ending ~line 84), add:

```js
      time_format: {
        allowNull: false,
        type: DataTypes.ENUM(['auto', '12h', '24h']),
        defaultValue: 'auto',
      },
```

- [ ] **Step 5: Add `time_format` to the read whitelist** — in `server/lib/user/user.getById.js`, add `'time_format',` to the `attributes` array (after `'distance_unit_preference',` on line 25):

```js
    attributes: [
      'id',
      'firstname',
      'lastname',
      'selector',
      'email',
      'language',
      'birthdate',
      'role',
      'temperature_unit_preference',
      'distance_unit_preference',
      'time_format',
      'created_at',
      'updated_at',
    ],
```

- [ ] **Step 6: Run the getById test to verify it passes**

Run: `cd server && NODE_ENV=test SQLITE_FILE_PATH=/tmp/gladys-test.db ./node_modules/.bin/mocha --require ./test/setup-env.js --recursive ./test/bootstrap.test.js "./test/lib/user/user.getById.test.js" --exit`
Expected: PASS (2 passing).

- [ ] **Step 7: Fix the rippled fixtures.** The new column also appears in methods that return a full user row (`getBySelector`, `updateBySelector`) and in `getMySelf` (which calls `getById`). Add `time_format: 'auto',` to the deep-equal expected object in each of these tests, next to their existing `temperature_unit_preference: 'celsius',` line:
  - `server/test/controllers/user/user.getMySelf.test.js` (~line 19)
  - `server/test/lib/user/user.getBySelector.test.js` (~line 28)
  - `server/test/controllers/user/user.getBySelector.test.js` (~line 22)
  - `server/test/lib/user/user.updateBySelector.test.js` (~line 31)

  For each, insert `      time_format: 'auto',` on its own line within the `deep.equal({ ... })` object. (`user.getByTelegramUserId` uses its own attribute whitelist that does **not** include `time_format`, so it needs no change.)

- [ ] **Step 8: Run the full user + user-controller suites to verify green**

Run: `cd server && NODE_ENV=test SQLITE_FILE_PATH=/tmp/gladys-test.db ./node_modules/.bin/mocha --require ./test/setup-env.js --recursive ./test/bootstrap.test.js "./test/lib/user/**/*.test.js" "./test/controllers/user/**/*.test.js" --exit`
Expected: PASS, 0 failing. If a test other than the four in Step 7 fails on a missing `time_format`, add `time_format: 'auto',` to its expected object and re-run.

- [ ] **Step 9: Lint the changed server files**

Run: `cd server && ./node_modules/.bin/eslint models/user.js lib/user/user.getById.js migrations/20260709120000-add-user-time-format.js`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add server/migrations/20260709120000-add-user-time-format.js server/models/user.js server/lib/user/user.getById.js server/test/lib/user/user.getById.test.js server/test/controllers/user/user.getMySelf.test.js server/test/lib/user/user.getBySelector.test.js server/test/controllers/user/user.getBySelector.test.js server/test/lib/user/user.updateBySelector.test.js
git commit -m "feat(user): add time_format preference column (auto/12h/24h)"
```

---

### Task 2: Frontend — shared `timeFormatToken` helper

**Files:**
- Create: `front/src/utils/timeFormat.js`

**Interfaces:**
- Produces: `timeFormatToken(preference, { withSeconds })` → a dayjs format token string. `'12h'`→`'h:mm A'`/`'h:mm:ss A'`; `'24h'`→`'HH:mm'`/`'HH:mm:ss'`; anything else (`'auto'`/undefined)→`'LT'`/`'LTS'`.

- [ ] **Step 1: Create the helper** — `front/src/utils/timeFormat.js`:

```js
/**
 * @description Return the dayjs format token for a user's time-format preference.
 * @param {string} preference - One of 'auto', '12h', '24h' (anything else is treated as 'auto').
 * @param {object} [options] - Options.
 * @param {boolean} [options.withSeconds] - Whether to include seconds.
 * @returns {string} A dayjs format token.
 * @example
 * dayjs().format(timeFormatToken(user.time_format));
 */
export function timeFormatToken(preference, { withSeconds = false } = {}) {
  if (preference === '12h') {
    return withSeconds ? 'h:mm:ss A' : 'h:mm A';
  }
  if (preference === '24h') {
    return withSeconds ? 'HH:mm:ss' : 'HH:mm';
  }
  // 'auto' or undefined: follow the locale (requires dayjs localizedFormat plugin at the call site)
  return withSeconds ? 'LTS' : 'LT';
}
```

- [ ] **Step 2: Verify behavior with an ad-hoc node evaluation** (frontend has no unit runner)

Run:
```bash
cd front && node -e "
const { timeFormatToken } = require('@babel/core').transform(require('fs').readFileSync('src/utils/timeFormat.js','utf8'),{presets:[['@babel/preset-env',{targets:{node:'current'}}]]}).code
  ? (()=>{const m={exports:{}};const c=require('@babel/core').transform(require('fs').readFileSync('src/utils/timeFormat.js','utf8'),{presets:[['@babel/preset-env',{targets:{node:'current'}}]]}).code;new Function('module','exports',c)(m,m.exports);return m.exports;})()
  : {};
console.log('12h', timeFormatToken('12h'), '|', timeFormatToken('12h',{withSeconds:true}));
console.log('24h', timeFormatToken('24h'), '|', timeFormatToken('24h',{withSeconds:true}));
console.log('auto', timeFormatToken('auto'), '|', timeFormatToken(undefined,{withSeconds:true}));
"
```
Expected output:
```
12h h:mm A | h:mm:ss A
24h HH:mm | HH:mm:ss
auto LT | LTS
```
(If the babel-transform one-liner is awkward in the environment, instead verify by pasting the function body into `node` directly — the point is only to confirm the four token mappings.)

- [ ] **Step 3: Lint & format-check**

Run: `cd front && ./node_modules/.bin/eslint src/utils/timeFormat.js && ./node_modules/.bin/prettier --check src/utils/timeFormat.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add front/src/utils/timeFormat.js
git commit -m "feat(front): add timeFormatToken helper for 12h/24h preference"
```

---

### Task 3: Frontend — clock box honors the preference

**Files:**
- Modify: `front/src/components/boxs/clock/Clock.jsx:68-70`

**Interfaces:**
- Consumes: `timeFormatToken` (Task 2); `this.props.user.time_format`.

- [ ] **Step 1: Import the helper** — add near the other imports at the top of `Clock.jsx` (after line 11 `import get from 'get-value';`):

```js
import { timeFormatToken } from '../../../utils/timeFormat';
```

- [ ] **Step 2: Use the preference for the time string** — replace the `const time = ...` block (lines 68-70) with:

```js
    const time = dayjs()
      .locale(this.props.user.language)
      .format(timeFormatToken(this.props.user.time_format, { withSeconds: displaySecond }));
```

(`localizedFormat` is already extended at the top of this file, so `LT`/`LTS` continue to work in `auto` mode.)

- [ ] **Step 3: Lint & format-check**

Run: `cd front && ./node_modules/.bin/eslint src/components/boxs/clock/Clock.jsx && ./node_modules/.bin/prettier --check src/components/boxs/clock/Clock.jsx`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add front/src/components/boxs/clock/Clock.jsx
git commit -m "feat(front): clock box respects user time_format preference"
```

---

### Task 4: Frontend — calendar box honors the preference

**Files:**
- Modify: `front/src/components/boxs/calendar/computeUpcoming.js` (imports + `describeEventTime`)
- Modify: `front/src/components/boxs/calendar/CalendarBox.jsx` (`toEventView` + `render`)

**Interfaces:**
- Consumes: `timeFormatToken` (Task 2); `props.user.time_format`, `props.user.language`.
- Note: `describeEventTime` is used only by `CalendarBox.jsx` (verified), so its signature can change.

- [ ] **Step 1: Update `computeUpcoming.js` imports** — replace line 1 (`import dayjs from 'dayjs';`) with:

```js
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import { timeFormatToken } from '../../../utils/timeFormat';

dayjs.extend(localizedFormat);
```

- [ ] **Step 2: Thread the preference through `describeEventTime`** — replace the whole `describeEventTime` function (lines 48-59) with:

```js
/**
 * @description Describe how to render an event's time.
 * @param {object} event - Event with { start, end, full_day }.
 * @param {(Date|string|number)} now - Current time.
 * @param {object} [options] - Options, { language, timeFormat }.
 * @returns {object} { ongoing, allDay, startsToday, startsTomorrow, time }.
 * @example
 * describeEventTime(event, new Date(), { language: 'en', timeFormat: '24h' });
 */
export function describeEventTime(event, now, options = {}) {
  const { language, timeFormat } = options;
  const start = dayjs(event.start);
  const end = event.end ? dayjs(event.end) : start;
  const nowD = dayjs(now);
  return {
    ongoing: !event.full_day && !start.isAfter(nowD) && end.isAfter(nowD),
    allDay: Boolean(event.full_day),
    startsToday: start.isSame(nowD, 'day'),
    startsTomorrow: start.isSame(nowD.add(1, 'day'), 'day'),
    time: start.locale(language).format(timeFormatToken(timeFormat))
  };
}
```

- [ ] **Step 3: Pass the preference from `CalendarBox.jsx`** — update `toEventView` (line 18) to accept `timeFormat` and forward it:

Change the signature and the `describeEventTime` call at the top of `toEventView`:

```js
function toEventView(event, now, language, timeFormat) {
  const desc = describeEventTime(event, now, { language, timeFormat });
```

- [ ] **Step 4: Read the preference in `render` and pass it in** — in `CalendarBoxComponent.render` (lines 147-152), add the `timeFormat` read and pass it to both `toEventView` calls:

```js
    const language = get(props, 'user.language');
    const timeFormat = get(props, 'user.time_format');
    const now = new Date();

    const nextEvent = get(upcoming, 'next');
    const nextView = nextEvent ? toEventView(nextEvent, now, language, timeFormat) : null;
    const todayViews = (get(upcoming, 'today') || []).map(event => toEventView(event, now, language, timeFormat));
```

- [ ] **Step 5: Lint & format-check**

Run: `cd front && ./node_modules/.bin/eslint src/components/boxs/calendar/computeUpcoming.js src/components/boxs/calendar/CalendarBox.jsx && ./node_modules/.bin/prettier --check src/components/boxs/calendar/computeUpcoming.js src/components/boxs/calendar/CalendarBox.jsx`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/boxs/calendar/computeUpcoming.js front/src/components/boxs/calendar/CalendarBox.jsx
git commit -m "feat(front): calendar box respects user time_format preference"
```

---

### Task 5: Frontend — profile UI selector, handler, and i18n

**Files:**
- Modify: `front/src/components/user/profile.jsx` (add a `<select>` after the distance-unit block, ~line 274)
- Modify: `front/src/routes/profile/index.js` (add `updateTimeFormat` handler + pass-down)
- Modify: `front/src/config/i18n/en.json`, `front/src/config/i18n/fr.json`, `front/src/config/i18n/de.json`

**Interfaces:**
- Consumes: `props.newUser.time_format`, `props.updateTimeFormat`; i18n keys `profile.timeFormatLabel`, `profile.timeFormatAuto`, `profile.timeFormat12h`, `profile.timeFormat24h`.

- [ ] **Step 1: Add the handler** — in `front/src/routes/profile/index.js`, add after `updateDistanceUnit` (lines 40-42):

```js
  updateTimeFormat = e => {
    this.props.updateNewUserProperty('time_format', e.target.value);
  };
```

- [ ] **Step 2: Pass the handler down** — in the same file, add to the `<DashboardProfilePage>` props (after `updateDistanceUnit={this.updateDistanceUnit}` on line 68):

```js
        updateTimeFormat={this.updateTimeFormat}
```

- [ ] **Step 3: Add the `<select>`** — in `front/src/components/user/profile.jsx`, immediately after the closing `)}` of the distance-unit `!props.disablePreferences` block (the block that ends ~line 274, right before the `!props.disableProfilePicture` block), insert:

```jsx
      {!props.disablePreferences && (
        <div class="form-group">
          <label class="form-label">
            <Text id="profile.timeFormatLabel" />
          </label>
          <select value={props.newUser.time_format} onInput={props.updateTimeFormat} class="form-control">
            <option value="auto">
              <Text id="profile.timeFormatAuto" />
            </option>
            <option value="12h">
              <Text id="profile.timeFormat12h" />
            </option>
            <option value="24h">
              <Text id="profile.timeFormat24h" />
            </option>
          </select>
        </div>
      )}
```

- [ ] **Step 4: Add i18n keys (en)** — in `front/src/config/i18n/en.json`, in the `profile` block after the `"german"` line (line 3086), add:

```json
    "timeFormatLabel": "Time format",
    "timeFormatAuto": "Automatic (based on language)",
    "timeFormat12h": "12-hour (1:30 PM)",
    "timeFormat24h": "24-hour (13:30)",
```

(Add a trailing comma to the previous `"german": "Deutsch"` line so JSON stays valid. Insert the keys before whatever key currently follows `german`.)

- [ ] **Step 5: Add i18n keys (fr)** — in `front/src/config/i18n/fr.json`, in the `profile` block after the `"german"` line (line 3086), add:

```json
    "timeFormatLabel": "Format de l'heure",
    "timeFormatAuto": "Automatique (selon la langue)",
    "timeFormat12h": "12 heures (1:30 PM)",
    "timeFormat24h": "24 heures (13:30)",
```

- [ ] **Step 6: Add i18n keys (de)** — in `front/src/config/i18n/de.json`, in the `profile` block after the `"german"` line (line 3067), add:

```json
    "timeFormatLabel": "Zeitformat",
    "timeFormatAuto": "Automatisch (nach Sprache)",
    "timeFormat12h": "12-Stunden (1:30 PM)",
    "timeFormat24h": "24-Stunden (13:30)",
```

- [ ] **Step 7: Verify translation-key parity and JSON validity**

Run: `cd front && npm run compare-translations`
Expected: exit 0, no missing/extra keys reported.

- [ ] **Step 8: Lint & format-check**

Run: `cd front && ./node_modules/.bin/eslint src/components/user/profile.jsx src/routes/profile/index.js && ./node_modules/.bin/prettier --check src/components/user/profile.jsx src/routes/profile/index.js 'src/config/i18n/*.json'`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add front/src/components/user/profile.jsx front/src/routes/profile/index.js front/src/config/i18n/en.json front/src/config/i18n/fr.json front/src/config/i18n/de.json
git commit -m "feat(front): add time format selector to profile page"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Server suite sanity** — run the user-related server tests once more together:

Run: `cd server && NODE_ENV=test SQLITE_FILE_PATH=/tmp/gladys-test.db ./node_modules/.bin/mocha --require ./test/setup-env.js --recursive ./test/bootstrap.test.js "./test/lib/user/**/*.test.js" "./test/controllers/user/**/*.test.js" --exit`
Expected: 0 failing.

- [ ] **Step 2: Frontend build** — confirm the app still builds:

Run: `cd front && npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Manual smoke (documented, run against a dev instance):**
  1. Log in, open Profile → confirm the new "Time format" selector shows (default "Automatic").
  2. Add/verify a **Clock** box and a **Calendar** box on the dashboard.
  3. Set preference to **24-hour**, save → clock shows `13:30`, calendar event times show `HH:mm`.
  4. Set preference to **12-hour**, save → clock and calendar show `1:30 PM` style.
  5. Set preference to **Automatic** → both follow the profile language (English → 12h, French/German → 24h).

---

## Self-Review

**Spec coverage:**
- Preference model (enum auto/12h/24h, default auto) → Task 1. ✓
- Migration + read-whitelist → Task 1 (Steps 3, 5). ✓
- Shared helper → Task 2. ✓
- Clock box → Task 3. ✓
- Calendar box (auto = follow locale) → Task 4. ✓
- Profile UI + i18n (3 files) → Task 5. ✓
- Testing (server getById test; helper verified; parity check) → Tasks 1, 2, 5, 6. ✓
- Out of scope (signup, per-widget) → not present. ✓
- Deviation from spec: model uses inline ENUM instead of a `constants.js` `TIME_FORMAT` constant (documented in Global Constraints). ✓

**Placeholder scan:** none — all steps contain concrete code and commands.

**Type/name consistency:** `timeFormatToken(preference, { withSeconds })` used identically in Tasks 2/3/4; `time_format` column/property name consistent across server, API, boxes, profile, and i18n `value` attributes.
