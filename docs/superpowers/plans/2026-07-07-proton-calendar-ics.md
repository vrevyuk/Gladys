# Read Proton Calendar in Gladys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user subscribe to a Proton Calendar "Share with anyone" ICS link and see its events in Gladys, by extending the existing `caldav` integration's WEBCAL support.

**Architecture:** A Proton share link is a read-only ICS feed. We store it as a `WEBCAL` calendar row (`t_calendar`) and let the existing `syncUserWebcals` engine poll it. A new backend `addWebcal` creates the row from a pasted URL (auto-naming from the feed) and a `destroyCalendar` removes it. The front reuses the Account tab's calendar-type `<select>` (new "Proton Calendar" option → single URL input) and adds a delete button on the Sync tab. Automatic sync interval drops from 12 h to 1 h.

**Tech Stack:** Node.js + Express (server, Mocha/Chai/Sinon tests), Preact + unistore (front), `ical` for ICS parsing, i18n JSON (en/fr/de).

## Global Constraints

- Node 22.x. Server ESLint = Airbnb + JSDoc on exported functions.
- **Server: 100% patch coverage** — every new/changed server line must be hit by a test.
- **i18n: `compare-translations`** requires `en.json`, `fr.json`, `de.json` to share identical keys. Any new key must be added to all three.
- Calendar rows already support `type='WEBCAL'`, `external_id=<url>`; no DB migration.
- Run `npm run prettier && npm run eslint` in every directory touched before committing. Front: also `npm run compare-translations` and `npm run build`.
- Do not commit test databases (`gladys-test.db`).

---

### Task 1: Backend `addWebcal` — subscribe to an ICS URL

**Files:**
- Create: `server/services/caldav/lib/calendar/calendar.addWebcal.js`
- Modify: `server/services/caldav/lib/index.js` (wire prototype)
- Test: `server/test/services/caldav/lib/calendar/addWebcal.test.js`

**Interfaces:**
- Consumes: `this.gladys.http.request('get', url, null)` → `{ data, status, headers }` (does not throw on non-2xx); `this.gladys.calendar.get(userId, { externalId })` → array; `this.gladys.calendar.create(obj)` → created calendar; `this.serviceId`; `this.syncUserWebcals(userId)`.
- Produces: `addWebcal(userId, url)` → `Promise<object>` (created calendar). Throws `BadParameters` with messages `MISSING_PARAMETERS`, `CALDAV_WEBCAL_ALREADY_EXISTS`, `CALDAV_INVALID_WEBCAL_URL`.

- [ ] **Step 1: Write the failing test**

Create `server/test/services/caldav/lib/calendar/addWebcal.test.js`:

```js
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { addWebcal } = require('../../../../../services/caldav/lib/calendar/calendar.addWebcal');

chai.use(chaiAsPromised);
const { expect } = chai;

const userId = 'f2e704c9-4c79-41b3-a5bf-914dd1a16127';
const serviceId = '5d6c666f-56be-4929-9104-718a78556844';
const url = 'https://calendar.proton.me/api/calendar/v1/url/token/calendar.ics';

describe('addWebcal', () => {
  let self;

  beforeEach(() => {
    self = {
      serviceId,
      addWebcal,
      syncUserWebcals: sinon.stub().resolves(),
      gladys: {
        http: { request: sinon.stub() },
        calendar: {
          get: sinon.stub().resolves([]),
          create: sinon.stub().resolvesArg(0),
        },
      },
    };
  });

  it('should subscribe to a webcal url, name it from the feed, and sync', async () => {
    self.gladys.http.request.resolves({
      data: 'BEGIN:VCALENDAR\nX-WR-CALNAME:My Proton\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR',
      status: 200,
    });
    const calendar = await self.addWebcal(userId, url);
    expect(calendar.name).to.equal('My Proton');
    expect(calendar.type).to.equal('WEBCAL');
    expect(calendar.external_id).to.equal(url);
    expect(calendar.service_id).to.equal(serviceId);
    expect(calendar.user_id).to.equal(userId);
    expect(calendar.sync).to.equal(true);
    expect(self.syncUserWebcals.calledOnceWith(userId)).to.equal(true);
  });

  it('should default the name when X-WR-CALNAME is absent', async () => {
    self.gladys.http.request.resolves({ data: 'BEGIN:VCALENDAR\nEND:VCALENDAR', status: 200 });
    const calendar = await self.addWebcal(userId, url);
    expect(calendar.name).to.equal('Proton Calendar');
  });

  it('should reject when url is missing', async () => {
    await expect(self.addWebcal(userId, '')).to.be.rejectedWith('MISSING_PARAMETERS');
  });

  it('should reject a duplicate url', async () => {
    self.gladys.calendar.get.resolves([{ id: 'existing' }]);
    await expect(self.addWebcal(userId, url)).to.be.rejectedWith('CALDAV_WEBCAL_ALREADY_EXISTS');
  });

  it('should reject an invalid feed (bad status)', async () => {
    self.gladys.http.request.resolves({ data: 'Not Found', status: 404 });
    await expect(self.addWebcal(userId, url)).to.be.rejectedWith('CALDAV_INVALID_WEBCAL_URL');
  });

  it('should reject an invalid feed (not iCalendar)', async () => {
    self.gladys.http.request.resolves({ data: '<html>nope</html>', status: 200 });
    await expect(self.addWebcal(userId, url)).to.be.rejectedWith('CALDAV_INVALID_WEBCAL_URL');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx mocha test/services/caldav/lib/calendar/addWebcal.test.js`
Expected: FAIL — `Cannot find module '.../calendar.addWebcal'`.

- [ ] **Step 3: Write minimal implementation**

Create `server/services/caldav/lib/calendar/calendar.addWebcal.js`:

```js
const logger = require('../../../../utils/logger');
const { BadParameters } = require('../../../../utils/coreErrors');

const DEFAULT_CALENDAR_COLOR = '#3174ad';
const DEFAULT_CALENDAR_NAME = 'Proton Calendar';

/**
 * @description Subscribe to a public ICS/Webcal URL (e.g. a Proton Calendar share link).
 * @param {string} userId - Gladys user id, owner of the calendar.
 * @param {string} url - Public ICS URL to subscribe to.
 * @returns {Promise<object>} Resolve with the created calendar.
 * @example
 * addWebcal('user-id', 'https://calendar.proton.me/....ics');
 */
async function addWebcal(userId, url) {
  if (!url) {
    throw new BadParameters('MISSING_PARAMETERS');
  }

  // Reject if this URL is already subscribed by the user
  const existingCalendars = await this.gladys.calendar.get(userId, { externalId: url });
  if (existingCalendars.length > 0) {
    throw new BadParameters('CALDAV_WEBCAL_ALREADY_EXISTS');
  }

  // Fetch the ICS feed (http.request does not throw on non-2xx)
  const { data: icalData, status } = await this.gladys.http.request('get', url, null);
  if (status !== 200 || typeof icalData !== 'string' || !icalData.includes('BEGIN:VCALENDAR')) {
    throw new BadParameters('CALDAV_INVALID_WEBCAL_URL');
  }

  // Read the calendar display name from X-WR-CALNAME, fallback to a default
  const calNameMatch = icalData.match(/X-WR-CALNAME:(.+)/);
  const name = calNameMatch ? calNameMatch[1].trim() : DEFAULT_CALENDAR_NAME;

  const calendar = await this.gladys.calendar.create({
    external_id: url,
    name,
    description: `Calendar ${name}`,
    color: DEFAULT_CALENDAR_COLOR,
    service_id: this.serviceId,
    user_id: userId,
    type: 'WEBCAL',
    sync: true,
  });

  logger.info(`CalDAV : Webcal calendar "${name}" subscribed for user ${userId}.`);

  // Sync events immediately (re-syncs all of the user's webcals, including this one)
  await this.syncUserWebcals(userId);

  return calendar;
}

module.exports = {
  addWebcal,
};
```

Then wire it in `server/services/caldav/lib/index.js` — add after the existing `syncUserWebcals` require/assignment:

```js
const { addWebcal } = require('./calendar/calendar.addWebcal');
```
and, alongside the other prototype assignments:
```js
CalDAVHandler.prototype.addWebcal = addWebcal;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx mocha test/services/caldav/lib/calendar/addWebcal.test.js`
Expected: PASS (6 passing).

- [ ] **Step 5: Lint and commit**

```bash
cd server && npm run prettier && npm run eslint
git add server/services/caldav/lib/calendar/calendar.addWebcal.js server/services/caldav/lib/index.js server/test/services/caldav/lib/calendar/addWebcal.test.js
git commit -m "feat(caldav): add addWebcal to subscribe to an ICS URL"
```

---

### Task 2: Backend `destroyCalendar` — delete a subscribed calendar

**Files:**
- Create: `server/services/caldav/lib/calendar/calendar.destroyCalendar.js`
- Modify: `server/services/caldav/lib/index.js` (wire prototype)
- Test: `server/test/services/caldav/lib/calendar/destroyCalendar.test.js`

**Interfaces:**
- Consumes: `this.gladys.calendar.destroy(selector)` → removes the calendar and its events.
- Produces: `destroyCalendar(selector)` → `Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `server/test/services/caldav/lib/calendar/destroyCalendar.test.js`:

```js
const { expect } = require('chai');
const sinon = require('sinon');
const { destroyCalendar } = require('../../../../../services/caldav/lib/calendar/calendar.destroyCalendar');

describe('destroyCalendar', () => {
  it('should destroy the calendar by selector', async () => {
    const self = {
      destroyCalendar,
      gladys: { calendar: { destroy: sinon.stub().resolves() } },
    };
    await self.destroyCalendar('my-proton-calendar');
    expect(self.gladys.calendar.destroy.calledOnceWith('my-proton-calendar')).to.equal(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx mocha test/services/caldav/lib/calendar/destroyCalendar.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `server/services/caldav/lib/calendar/calendar.destroyCalendar.js`:

```js
const logger = require('../../../../utils/logger');

/**
 * @description Delete a calendar and all its events.
 * @param {string} selector - Calendar selector to delete.
 * @returns {Promise} Resolve when the calendar is deleted.
 * @example
 * destroyCalendar('my-proton-calendar');
 */
async function destroyCalendar(selector) {
  await this.gladys.calendar.destroy(selector);
  logger.info(`Calendar ${selector} deleted`);
}

module.exports = {
  destroyCalendar,
};
```

Wire it in `server/services/caldav/lib/index.js`:
```js
const { destroyCalendar } = require('./calendar/calendar.destroyCalendar');
```
```js
CalDAVHandler.prototype.destroyCalendar = destroyCalendar;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx mocha test/services/caldav/lib/calendar/destroyCalendar.test.js`
Expected: PASS (1 passing).

- [ ] **Step 5: Lint and commit**

```bash
cd server && npm run prettier && npm run eslint
git add server/services/caldav/lib/calendar/calendar.destroyCalendar.js server/services/caldav/lib/index.js server/test/services/caldav/lib/calendar/destroyCalendar.test.js
git commit -m "feat(caldav): add destroyCalendar to delete a subscribed calendar"
```

---

### Task 3: Backend controller routes + tolerant sync + 1 h interval

**Files:**
- Modify: `server/services/caldav/api/caldav.controller.js` (add 2 routes, make `sync` tolerant)
- Modify: `server/services/caldav/index.js` (expose handler methods, change interval to 1 h)
- Test: `server/test/services/caldav/controllers/caldav.controller.test.js` (update `sync`, add webcal + delete tests)

**Interfaces:**
- Consumes: `caldavHandler.addWebcal(userId, url)`, `caldavHandler.destroyCalendar(selector)`, `caldavHandler.gladys.variable.getValue(name, serviceId, userId)`, `caldavHandler.serviceId`.
- Produces routes: `POST /api/v1/service/caldav/webcal` (body `{ url }` → 201 + calendar), `DELETE /api/v1/service/caldav/calendar/:selector` (→ `{ success: true }`). `GET /sync` now only calls `syncUserCalendars` when `CALDAV_URL` is set.

- [ ] **Step 1: Update the controller test (failing)**

In `server/test/services/caldav/controllers/caldav.controller.test.js`, extend the shared `caldavService` mock (top of file) to include the new handler surface:

```js
const caldavService = {
  config: stub(),
  cleanUp: stub(),
  enableCalendar: stub(),
  disableCalendar: stub(),
  syncUserCalendars: stub(),
  syncUserWebcals: stub(),
  addWebcal: stub(),
  destroyCalendar: stub(),
  serviceId: 'service-id',
  gladys: {
    variable: { getValue: stub() },
  },
};
```

Replace the existing `get /api/v1/service/caldav/sync` describe block with:

```js
describe('get /api/v1/service/caldav/sync', () => {
  it('should sync webcals and caldav when CALDAV_URL is set', async () => {
    caldavService.gladys.variable.getValue.resolves('https://caldav.host/');
    caldavService.syncUserCalendars.resolves({});
    caldavService.syncUserWebcals.resolves({});
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId } };
    await caldavController['get /api/v1/service/caldav/sync'].controller(req, res);
    assert.calledWith(caldavService.syncUserCalendars, userId);
    assert.calledWith(caldavService.syncUserWebcals, userId);
  });

  it('should sync only webcals when CALDAV_URL is not set', async () => {
    caldavService.gladys.variable.getValue.resolves(null);
    caldavService.syncUserCalendars.resetHistory();
    caldavService.syncUserWebcals.resolves({});
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId } };
    await caldavController['get /api/v1/service/caldav/sync'].controller(req, res);
    assert.notCalled(caldavService.syncUserCalendars);
    assert.calledWith(caldavService.syncUserWebcals, userId);
  });
});
```

Add two new describe blocks at the end of the file:

```js
describe('post /api/v1/service/caldav/webcal', () => {
  it('should subscribe to a webcal url', async () => {
    caldavService.addWebcal.resolves({ selector: 'my-proton' });
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId }, body: { url: 'https://proton/cal.ics' } };
    await caldavController['post /api/v1/service/caldav/webcal'].controller(req, res);
    assert.calledWith(caldavService.addWebcal, userId, 'https://proton/cal.ics');
  });
});

describe('delete /api/v1/service/caldav/calendar/:selector', () => {
  it('should delete a calendar', async () => {
    caldavService.destroyCalendar.resolves();
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId }, params: { selector: 'my-proton' } };
    await caldavController['delete /api/v1/service/caldav/calendar/:selector'].controller(req, res);
    assert.calledWith(caldavService.destroyCalendar, 'my-proton');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx mocha test/services/caldav/controllers/caldav.controller.test.js`
Expected: FAIL — `Cannot read properties of undefined` / route keys missing.

- [ ] **Step 3: Implement controller changes**

In `server/services/caldav/api/caldav.controller.js`, replace the `sync` function and add two handlers:

```js
  /**
   * @api {get} /api/v1/service/caldav/sync Start caldav sync for a user
   * @apiName Sync
   * @apiGroup CalDAV
   */
  async function sync(req, res) {
    const caldavUrl = await caldavHandler.gladys.variable.getValue(
      'CALDAV_URL',
      caldavHandler.serviceId,
      req.user.id,
    );
    if (caldavUrl) {
      await caldavHandler.syncUserCalendars(req.user.id);
    }
    await caldavHandler.syncUserWebcals(req.user.id);
    res.json({
      success: true,
    });
  }

  /**
   * @api {post} /api/v1/service/caldav/webcal Subscribe to an ICS/Webcal URL
   * @apiName AddWebcal
   * @apiGroup CalDAV
   */
  async function addWebcal(req, res) {
    const calendar = await caldavHandler.addWebcal(req.user.id, req.body.url);
    res.status(201).json(calendar);
  }

  /**
   * @api {delete} /api/v1/service/caldav/calendar/:selector Delete a calendar
   * @apiName DestroyCalendar
   * @apiGroup CalDAV
   */
  async function destroyCalendar(req, res) {
    await caldavHandler.destroyCalendar(req.params.selector);
    res.json({
      success: true,
    });
  }
```

Add the routes to the returned object:

```js
    'post /api/v1/service/caldav/webcal': {
      authenticated: true,
      controller: asyncMiddleware(addWebcal),
    },
    'delete /api/v1/service/caldav/calendar/:selector': {
      authenticated: true,
      controller: asyncMiddleware(destroyCalendar),
    },
```

In `server/services/caldav/index.js`:
- Change the webcal interval (in `start()`) from `1000 * 60 * 60 * 12` to `1000 * 60 * 60`, and update the JSDoc on `start` to say "every 1h" instead of "every 12h".
- Expose the new handler methods so the controller can reach them — the controller receives `calDavHandler` already, so no change needed there; but confirm the returned object still passes `calDavHandler` to `CalDAVController(calDavHandler)` (it does).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx mocha test/services/caldav/controllers/caldav.controller.test.js test/services/caldav/index.test.js`
Expected: PASS (all green; index.test.js does not assert interval value so it is unaffected).

- [ ] **Step 5: Lint and commit**

```bash
cd server && npm run prettier && npm run eslint
git add server/services/caldav/api/caldav.controller.js server/services/caldav/index.js server/test/services/caldav/controllers/caldav.controller.test.js
git commit -m "feat(caldav): webcal + delete routes, tolerant sync, 1h interval"
```

---

### Task 4: Backend — full coverage check

**Files:** none (verification only).

- [ ] **Step 1: Run the full caldav suite with coverage**

Run: `cd server && npx nyc --check-coverage=false mocha 'test/services/caldav/**/*.test.js'`
Expected: PASS — all caldav tests green.

- [ ] **Step 2: Confirm patch coverage locally**

Run: `cd server && npm run coverage 2>&1 | tail -30`
Expected: coverage run completes; every new line in `calendar.addWebcal.js`, `calendar.destroyCalendar.js`, and the controller changes is covered (the tests above exercise each branch). If any new line is uncovered, add a test hitting it before proceeding.

- [ ] **Step 3: Commit (only if any test was added)**

```bash
git add -A && git commit -m "test(caldav): cover webcal add/delete edge cases"
```

---

### Task 5: Front — Account tab Proton option

**Files:**
- Modify: `front/src/routes/integration/all/caldav/account-page/AccountTab.jsx`
- Modify: `front/src/routes/integration/all/caldav/account-page/actions.js`
- Modify: `front/src/utils/consts.js` (two new CalDAVStatus values)
- Modify: `front/src/config/i18n/en.json`, `fr.json`, `de.json`

**Interfaces:**
- Consumes: `props.caldavHost` state, `state.httpClient.post('/api/v1/service/caldav/webcal', { url })`.
- Produces: when `caldavHost === 'proton'`, only the "Proton Calendar URL" input is shown; Save posts to `/webcal`.

- [ ] **Step 1: Add status constants**

In `front/src/utils/consts.js`, inside `CalDAVStatus`, add two entries (keep existing ones):

```js
  RequestEventsError: 'RequestEventsError',
  InvalidWebcalUrl: 'InvalidWebcalUrl',
  WebcalAlreadyExists: 'WebcalAlreadyExists'
```

- [ ] **Step 2: Add the Proton option and conditional fields in AccountTab.jsx**

The host `<select>` already renders every key in `props.dictionary.services`; adding a `proton` key to the i18n `services` object (Step 4) makes the option appear automatically — no JSX change to the select itself.

Wrap the CalDAV-only fields so they hide for Proton. Change the username, password, and SSL-switch blocks (and the CalDAV URL block's label help) so they render only when `props.caldavHost !== 'proton'`. Concretely, wrap the SSL switch, the URL `form-group`, the username `form-group`, and the password `form-group` each in `{props.caldavHost !== 'proton' && ( ... )}`, and add a Proton-only URL block plus alerts. Insert this block immediately after the host `<select>`'s closing `</div>` of its `form-group`:

```jsx
          {props.caldavHost === 'proton' && (
            <div class="form-group">
              <div class="form-label">
                <Text id="integration.caldav.services.proton.url" />
              </div>
              <Text id="integration.caldav.services.proton.urlInfo" />
              <Localizer>
                <input
                  type="text"
                  class="form-control"
                  placeholder={<Text id="integration.caldav.services.proton.url" />}
                  onInput={props.updateCaldavUrl}
                  value={props.caldavUrl}
                />
              </Localizer>
              {props.caldavSaveSettingsStatus === CalDAVStatus.InvalidWebcalUrl && (
                <div class="alert alert-danger mt-2">
                  <Text id="integration.caldav.configurationWebcalInvalidUrl" />
                </div>
              )}
              {props.caldavSaveSettingsStatus === CalDAVStatus.WebcalAlreadyExists && (
                <div class="alert alert-danger mt-2">
                  <Text id="integration.caldav.configurationWebcalAlreadyExists" />
                </div>
              )}
              {props.caldavSaveSettingsStatus === CalDAVStatus.Success && (
                <p class="alert alert-info mt-2">
                  <Text id="integration.caldav.configurationWebcalSuccess" />
                </p>
              )}
            </div>
          )}
```

For the action buttons area at the bottom, hide the "Clean up" button when `caldavHost === 'proton'` (Proton users manage/delete calendars on the Sync tab). Wrap each Clean up button (both the mobile `d-sm-none` one and the desktop one) in `{props.caldavHost !== 'proton' && ( ... )}`. Keep Save and Sync buttons visible for all hosts.

- [ ] **Step 3: Branch the save action for Proton in actions.js**

In `front/src/routes/integration/all/caldav/account-page/actions.js`:

Add a preset clear for Proton in `updateCaldavHost` (after the existing `apple`/`google` branches):

```js
    } else if (e.target.value === 'proton') {
      store.setState({
        caldavUrl: ''
      });
    }
```

At the very start of `saveCaldavSettings(state)` body, branch to the webcal flow for Proton before the existing CalDAV logic:

```js
  async saveCaldavSettings(state) {
    if (state.caldavHost === 'proton') {
      store.setState({
        caldavSaveSettingsStatus: CalDAVStatus.Getting,
        caldavCleanUpStatus: null,
        caldavSyncStatus: null,
        caldavLog: null
      });
      try {
        await state.httpClient.post('/api/v1/service/caldav/webcal', {
          url: state.caldavUrl
        });
        store.setState({
          caldavSaveSettingsStatus: CalDAVStatus.Success,
          caldavUrl: ''
        });
      } catch (e) {
        let responseMessage = get(e, 'response.data.message');
        if (responseMessage && typeof responseMessage === 'object') {
          responseMessage = responseMessage.message;
        }
        if (responseMessage === 'CALDAV_INVALID_WEBCAL_URL') {
          store.setState({ caldavSaveSettingsStatus: CalDAVStatus.InvalidWebcalUrl });
        } else if (responseMessage === 'CALDAV_WEBCAL_ALREADY_EXISTS') {
          store.setState({ caldavSaveSettingsStatus: CalDAVStatus.WebcalAlreadyExists });
        } else {
          store.setState({ caldavSaveSettingsStatus: CalDAVStatus.Error });
        }
      }
      return;
    }
    // ... existing CalDAV save logic unchanged below ...
```

Keep everything after this block exactly as it was (the existing `store.setState({ caldavSaveSettingsStatus: CalDAVStatus.Getting, ... })` and CalDAV variable saves).

- [ ] **Step 4: Add i18n keys to all three files**

In `front/src/config/i18n/en.json`, under `integration.caldav.services`, add:

```json
"proton": {
  "name": "Proton Calendar",
  "url": "Proton Calendar URL",
  "urlInfo": "In Proton Calendar, open your calendar's settings, choose 'Share with anyone', create a link (Full view for event details), and paste it here."
}
```

and under `integration.caldav` (alongside the other `configuration*` keys) add:

```json
"configurationWebcalSuccess": "Proton calendar added successfully.",
"configurationWebcalInvalidUrl": "This URL is not a valid calendar link. Check that you copied the Proton 'Share with anyone' link.",
"configurationWebcalAlreadyExists": "This calendar is already subscribed."
```

Add the **same keys** with French values to `fr.json`:

```json
"proton": {
  "name": "Proton Calendar",
  "url": "URL Proton Calendar",
  "urlInfo": "Dans Proton Calendar, ouvrez les paramètres de votre agenda, choisissez « Partager avec tout le monde », créez un lien (vue complète pour les détails des événements) et collez-le ici."
}
```
```json
"configurationWebcalSuccess": "Agenda Proton ajouté avec succès.",
"configurationWebcalInvalidUrl": "Cette URL n'est pas un lien d'agenda valide. Vérifiez que vous avez copié le lien Proton « Partager avec tout le monde ».",
"configurationWebcalAlreadyExists": "Cet agenda est déjà synchronisé."
```

Add the **same keys** with German values to `de.json`:

```json
"proton": {
  "name": "Proton Calendar",
  "url": "Proton Calendar-URL",
  "urlInfo": "Öffne in Proton Calendar die Einstellungen deines Kalenders, wähle „Mit allen teilen“, erstelle einen Link (vollständige Ansicht für Ereignisdetails) und füge ihn hier ein."
}
```
```json
"configurationWebcalSuccess": "Proton-Kalender erfolgreich hinzugefügt.",
"configurationWebcalInvalidUrl": "Diese URL ist kein gültiger Kalenderlink. Prüfe, ob du den Proton-Link „Mit allen teilen“ kopiert hast.",
"configurationWebcalAlreadyExists": "Dieser Kalender ist bereits abonniert."
```

- [ ] **Step 5: Validate translations, lint, build**

Run:
```bash
cd front && npm run compare-translations && npm run prettier && npm run eslint && npm run build
```
Expected: `compare-translations` passes (identical keys), prettier/eslint clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add front/src/routes/integration/all/caldav/account-page/AccountTab.jsx front/src/routes/integration/all/caldav/account-page/actions.js front/src/utils/consts.js front/src/config/i18n/en.json front/src/config/i18n/fr.json front/src/config/i18n/de.json
git commit -m "feat(front): Proton Calendar option on CalDAV Account tab"
```

---

### Task 6: Front — Sync tab delete button

**Files:**
- Modify: `front/src/routes/integration/all/caldav/sync-page/SyncTab.jsx`
- Modify: `front/src/routes/integration/all/caldav/sync-page/actions.js`
- Modify: `front/src/routes/integration/all/caldav/sync-page/index.js` (connect new action if needed)
- Modify: `front/src/config/i18n/en.json`, `fr.json`, `de.json` (delete button label)

**Interfaces:**
- Consumes: `state.httpClient.delete('/api/v1/service/caldav/calendar/:selector')`, `getCaldavSetting` (reload list).
- Produces: `deleteCalendar(state, selector)` action; a 🗑 button per calendar row.

- [ ] **Step 1: Add the delete action**

In `front/src/routes/integration/all/caldav/sync-page/actions.js`, add an action inside the returned object:

```js
  async deleteCalendar(state, selector) {
    try {
      await state.httpClient.delete(`/api/v1/service/caldav/calendar/${selector}`);
      store.setState({
        caldavCalendars: state.caldavCalendars.filter(calendar => calendar.selector !== selector)
      });
    } catch (e) {
      store.setState({
        caldavSaveSyncStatus: CalDAVStatus.Error
      });
    }
  },
```

- [ ] **Step 2: Render the delete button per row in SyncTab.jsx**

Inside the `.map(calendar => ...)` that renders each `custom-switch` label, wrap the label and a delete button in a flex row. Replace the returned `<label>...</label>` with:

```jsx
                    return (
                      <div class={cx('d-flex align-items-center justify-content-between', style.switchLabel)}>
                        <label class="custom-switch mb-0">
                          <input
                            type="checkbox"
                            name={calendar.selector}
                            class="custom-switch-input"
                            checked={props.calendarsToSync ? props.calendarsToSync[calendar.selector] : calendar.sync}
                            onClick={props.updateCalendarsToSync}
                          />
                          <span class={cx('custom-switch-indicator', style.switchIndicator)} />
                          {calendar.name}
                        </label>
                        <button
                          type="button"
                          class="btn btn-link text-danger p-0"
                          title="Delete"
                          onClick={() => props.deleteCalendar(calendar.selector)}
                        >
                          <i class="fe fe-trash-2" />
                        </button>
                      </div>
                    );
```

Note: this uses the existing `cx` import (already imported in `SyncTab.jsx`). The `deleteCalendar` prop is provided because the page connects `actions` (see Step 3).

- [ ] **Step 3: Confirm the action is connected**

Open `front/src/routes/integration/all/caldav/sync-page/index.js`. It already does `connect('...', actions)(SyncPage)`, so `deleteCalendar` is available as a prop automatically. If `SyncTab` is rendered as `<SyncTab {...props} />`, no change is needed. Verify `deleteCalendar` reaches `SyncTab` as a prop; if the page passes props explicitly, add `deleteCalendar={props.deleteCalendar}`.

- [ ] **Step 4: Add the delete label to i18n (all three files)**

Add to `integration.caldav` in `en.json`:
```json
"buttonDelete": "Delete"
```
`fr.json`:
```json
"buttonDelete": "Supprimer"
```
`de.json`:
```json
"buttonDelete": "Löschen"
```

Then replace the button's `title="Delete"` with a localized title using `Localizer` + `Text` (SyncTab already imports `Text`; add `Localizer` to the `preact-i18n` import):

```jsx
                        <Localizer>
                          <button
                            type="button"
                            class="btn btn-link text-danger p-0"
                            title={<Text id="integration.caldav.buttonDelete" />}
                            onClick={() => props.deleteCalendar(calendar.selector)}
                          >
                            <i class="fe fe-trash-2" />
                          </button>
                        </Localizer>
```

- [ ] **Step 5: Validate translations, lint, build**

Run:
```bash
cd front && npm run compare-translations && npm run prettier && npm run eslint && npm run build
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add front/src/routes/integration/all/caldav/sync-page/ front/src/config/i18n/en.json front/src/config/i18n/fr.json front/src/config/i18n/de.json
git commit -m "feat(front): delete button for subscribed calendars on Sync tab"
```

---

### Task 7: End-to-end manual verification

**Files:** none.

- [ ] **Step 1: Run the app**

Run: `npm start` (repo root). Open `http://localhost:1444`, sign in.

- [ ] **Step 2: Verify the Proton flow**

1. Go to Integrations → CalDAV → Account tab. Select "Proton Calendar" in the type dropdown → confirm only the "Proton Calendar URL" input remains (no username/password/SSL).
2. Paste a real Proton "Share with anyone" ICS URL (or any public `.ics` URL for testing) → Save → confirm success alert.
3. Open the main Calendar page (`/calendar`) → confirm events from the feed appear.
4. Back to CalDAV → Sync tab → confirm the new calendar is listed with a sync toggle and a delete (🗑) button.
5. Add a second public ICS URL the same way → confirm both appear (multiple calendars).
6. Click delete on one → confirm it disappears from the list and its events disappear from `/calendar`.
7. Paste an invalid URL (e.g. `https://example.com`) → confirm the "not a valid calendar link" error.

- [ ] **Step 3: Final full check before PR**

Run:
```bash
cd server && npm run prettier-check && npm run eslint && npm run coverage
cd ../front && npm run prettier-check && npm run eslint && npm run compare-translations && npm run build
```
Expected: all green. This mirrors the CI jobs; do not open a non-draft PR until they pass.

---

## Self-Review

- **Spec coverage:** §3 data model → Task 1 (creates WEBCAL row). §4.1 addWebcal → Task 1. §4.2 destroyCalendar → Task 2. §4.3 controller routes + tolerant sync → Task 3. §4.4 interval → Task 3. §4.5 wiring → Tasks 1–2. §5.1 Account tab → Task 5. §5.2 Sync tab delete → Task 6. §5.3 i18n → Tasks 5–6. §6 error handling → Task 1 (throws) + Task 5 (UI mapping). §7 testing → Tasks 1–4. §8 out-of-scope respected (no write-back, no new service).
- **Placeholders:** none — every code step shows full code.
- **Type consistency:** `addWebcal(userId, url)`, `destroyCalendar(selector)`, error message strings (`CALDAV_INVALID_WEBCAL_URL`, `CALDAV_WEBCAL_ALREADY_EXISTS`, `MISSING_PARAMETERS`), and CalDAVStatus values (`InvalidWebcalUrl`, `WebcalAlreadyExists`) match between backend throws, controller, and front mapping.
