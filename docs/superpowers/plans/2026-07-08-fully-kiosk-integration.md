# Fully Kiosk Browser Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gladys integration that controls and monitors a Fully Kiosk Browser dashboard tablet over its local Remote Admin REST API (screen on/off, brightness, battery, charging, load-URL, text-to-speech).

**Architecture:** A self-contained backend service at `server/services/fully-kiosk/` modeled on `tasmota`/`rtsp-camera`: a `FullyKioskHandler` exposing `setValue` (control) and `poll` (state refresh), a low-level HTTP command helper, and a controller with a "test connection" endpoint. Each tablet is a Gladys **device** (added from the front-end by POSTing to the generic `/api/v1/device`) with features for screen, brightness, battery, charging, load-URL, and TTS. Gladys core drives `setValue`/`poll` by `device.service.name`. A front-end integration page (Preact + unistore) lists tablets and provides an add/edit/test form.

**Tech Stack:** Node.js, `axios` (HTTP), Mocha + Chai + Sinon (tests, existing in repo); front-end Preact + unistore, existing i18n JSON files.

## Global Constraints

- Service folder name is the service name used everywhere: **`fully-kiosk`** (matches `serviceManager.getService(device.service.name)`).
- `external_id` scheme — device: `fully-kiosk:<ip>`; feature: `fully-kiosk:<ip>:<command>` where `<command>` ∈ {`screen`, `brightness`, `battery`, `charging`, `load-url`, `tts`}. Split on `:` is safe because IPv4 contains no colons.
- Local network only. Base URL per tablet: `http://<ip>:<port>/?cmd=<cmd>&password=<pw>&type=json`, default port `2323`.
- Device params (names are exact string constants): `IP_ADDRESS`, `PORT` (default `"2323"`), `PASSWORD`.
- Persist state ONLY via `this.gladys.event.emit(EVENTS.DEVICE.NEW_STATE, { device_feature_external_id, state })` — never write a raw feature object.
- Feature constants come from `server/utils/constants.js`: `DEVICE_FEATURE_CATEGORIES`, `DEVICE_FEATURE_TYPES`, `DEVICE_FEATURE_UNITS`, `DEVICE_POLL_FREQUENCIES`, `EVENTS`.
- Brightness stays on Fully's native `0–255` scale (no percentage conversion) — decided in the design spec.
- Poll frequency for v1: `DEVICE_POLL_FREQUENCIES.EVERY_30_SECONDS`.
- Motion, MQTT events, and restart/reboot are **out of v1 scope** (design spec, phase 2).
- Run backend tests with: `cd server && npm_config_service=fully-kiosk npm run test-service` (runs only this service's tests; requires `SQLITE_FILE_PATH` handled by the script).

---

### Task 1: Backend scaffold — service module, constants, command helper, registration

**Files:**
- Create: `server/services/fully-kiosk/package.json`
- Create: `server/services/fully-kiosk/index.js`
- Create: `server/services/fully-kiosk/lib/index.js`
- Create: `server/services/fully-kiosk/lib/fully-kiosk.constants.js`
- Create: `server/services/fully-kiosk/lib/fully-kiosk.command.js`
- Modify: `server/services/index.js` (add registration line)
- Test: `server/test/services/fully-kiosk/lib/fully-kiosk.command.test.js`

**Interfaces:**
- Produces:
  - `FullyKioskHandler(gladys, serviceId)` with instance props `gladys`, `serviceId`, `axios` (an axios instance, overridable in tests), and prototype methods `setValue` (Task 2), `poll` (Task 3), `sendCommand`, `getDeviceInfo`.
  - `sendCommand(device, cmd, extraParams = {})` → `Promise` resolving to the axios response; builds URL via `buildCommandUrl`.
  - `buildCommandUrl(device, cmd, extraParams = {})` → `string` (exported from `fully-kiosk.command.js`).
  - `getDeviceInfo(device)` → `Promise<object>` resolving to the parsed `deviceInfo` JSON (`response.data`).
  - Constants object `DEVICE_PARAM_NAME = { IP_ADDRESS, PORT, PASSWORD }`, `DEFAULT_PORT = '2323'`, `EXTERNAL_ID_PREFIX = 'fully-kiosk'`, `DEFAULT_TIMEOUT = 4000`.
- Consumes: `getDeviceParam` from `server/utils/device.js`.

- [ ] **Step 1: Write the failing test**

Create `server/test/services/fully-kiosk/lib/fully-kiosk.command.test.js`:

```javascript
const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');
const { buildCommandUrl } = require('../../../../services/fully-kiosk/lib/fully-kiosk.command');

const device = {
  external_id: 'fully-kiosk:192.168.1.50',
  params: [
    { name: 'IP_ADDRESS', value: '192.168.1.50' },
    { name: 'PORT', value: '2323' },
    { name: 'PASSWORD', value: 's3cret' },
  ],
};

describe('fully-kiosk buildCommandUrl', () => {
  it('should build a base command url with cmd, password and type=json', () => {
    const url = buildCommandUrl(device, 'screenOn');
    expect(url).to.equal('http://192.168.1.50:2323/?cmd=screenOn&password=s3cret&type=json');
  });

  it('should append extra params', () => {
    const url = buildCommandUrl(device, 'setStringSetting', { key: 'screenBrightness', value: 200 });
    expect(url).to.equal(
      'http://192.168.1.50:2323/?cmd=setStringSetting&password=s3cret&type=json&key=screenBrightness&value=200',
    );
  });

  it('should fall back to ip from external_id and default port 2323', () => {
    const url = buildCommandUrl({ external_id: 'fully-kiosk:10.0.0.9', params: [{ name: 'PASSWORD', value: 'p' }] }, 'screenOff');
    expect(url).to.equal('http://10.0.0.9:2323/?cmd=screenOff&password=p&type=json');
  });
});

describe('fully-kiosk sendCommand', () => {
  it('should GET the built url on the injected axios instance', async () => {
    const handler = new FullyKioskHandler({}, 'service-id');
    handler.axios = { get: sinon.fake.resolves({ data: { status: 'OK' } }) };
    await handler.sendCommand(device, 'screenOn');
    expect(handler.axios.get.calledOnce).to.equal(true);
    expect(handler.axios.get.firstCall.args[0]).to.equal(
      'http://192.168.1.50:2323/?cmd=screenOn&password=s3cret&type=json',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: FAIL — `Cannot find module '../../../../services/fully-kiosk/lib'`.

- [ ] **Step 3: Write the constants file**

Create `server/services/fully-kiosk/lib/fully-kiosk.constants.js`:

```javascript
const DEVICE_PARAM_NAME = {
  IP_ADDRESS: 'IP_ADDRESS',
  PORT: 'PORT',
  PASSWORD: 'PASSWORD',
};

const DEFAULT_PORT = '2323';
const DEFAULT_TIMEOUT = 4000;
const EXTERNAL_ID_PREFIX = 'fully-kiosk';

// Fully Remote Admin REST command names.
const FULLY_COMMANDS = {
  SCREEN_ON: 'screenOn',
  SCREEN_OFF: 'screenOff',
  SET_STRING_SETTING: 'setStringSetting',
  LOAD_URL: 'loadUrl',
  TEXT_TO_SPEECH: 'textToSpeech',
  DEVICE_INFO: 'deviceInfo',
};

module.exports = {
  DEVICE_PARAM_NAME,
  DEFAULT_PORT,
  DEFAULT_TIMEOUT,
  EXTERNAL_ID_PREFIX,
  FULLY_COMMANDS,
};
```

- [ ] **Step 4: Write the command helper**

Create `server/services/fully-kiosk/lib/fully-kiosk.command.js`:

```javascript
const { getDeviceParam } = require('../../../utils/device');
const { DEVICE_PARAM_NAME, DEFAULT_PORT, FULLY_COMMANDS } = require('./fully-kiosk.constants');

/**
 * @description Build the Fully Kiosk Remote Admin REST URL for a command.
 * @param {object} device - The Gladys device (tablet).
 * @param {string} cmd - Fully command name.
 * @param {object} extraParams - Extra query params to append.
 * @returns {string} The full request URL.
 * @example
 * buildCommandUrl(device, 'screenOn');
 */
function buildCommandUrl(device, cmd, extraParams = {}) {
  const ip = getDeviceParam(device, DEVICE_PARAM_NAME.IP_ADDRESS) || device.external_id.split(':')[1];
  const port = getDeviceParam(device, DEVICE_PARAM_NAME.PORT) || DEFAULT_PORT;
  const password = getDeviceParam(device, DEVICE_PARAM_NAME.PASSWORD) || '';
  const url = new URL(`http://${ip}:${port}/`);
  url.searchParams.set('cmd', cmd);
  url.searchParams.set('password', password);
  url.searchParams.set('type', 'json');
  Object.keys(extraParams).forEach((key) => {
    url.searchParams.set(key, extraParams[key]);
  });
  // URL encodes spaces as %20 in the query — matches Fully's expectations.
  return url.toString();
}

/**
 * @description Send a command to a tablet over its Remote Admin REST API.
 * @param {object} device - The Gladys device (tablet).
 * @param {string} cmd - Fully command name.
 * @param {object} extraParams - Extra query params to append.
 * @returns {Promise} The axios response.
 * @example
 * await handler.sendCommand(device, 'screenOn');
 */
async function sendCommand(device, cmd, extraParams = {}) {
  const url = buildCommandUrl(device, cmd, extraParams);
  return this.axios.get(url);
}

/**
 * @description Fetch and return the parsed deviceInfo JSON from a tablet.
 * @param {object} device - The Gladys device (tablet).
 * @returns {Promise<object>} The parsed deviceInfo object.
 * @example
 * const info = await handler.getDeviceInfo(device);
 */
async function getDeviceInfo(device) {
  const response = await this.sendCommand(device, FULLY_COMMANDS.DEVICE_INFO);
  return response.data;
}

module.exports = {
  buildCommandUrl,
  sendCommand,
  getDeviceInfo,
};
```

- [ ] **Step 5: Write the handler (lib/index.js)**

Create `server/services/fully-kiosk/lib/index.js`:

```javascript
const axios = require('axios');
const { DEFAULT_TIMEOUT } = require('./fully-kiosk.constants');
const { buildCommandUrl, sendCommand, getDeviceInfo } = require('./fully-kiosk.command');

/**
 * @description Handler for the Fully Kiosk Browser integration.
 * @param {object} gladys - The Gladys instance.
 * @param {string} serviceId - The UUID of this service in DB.
 * @example
 * const handler = new FullyKioskHandler(gladys, serviceId);
 */
const FullyKioskHandler = function FullyKioskHandler(gladys, serviceId) {
  this.gladys = gladys;
  this.serviceId = serviceId;
  // @ts-ignore
  this.axios = axios.create({ timeout: DEFAULT_TIMEOUT });
};

FullyKioskHandler.prototype.buildCommandUrl = buildCommandUrl;
FullyKioskHandler.prototype.sendCommand = sendCommand;
FullyKioskHandler.prototype.getDeviceInfo = getDeviceInfo;

module.exports = FullyKioskHandler;
```

> Note: `buildCommandUrl` is a pure function also exported directly from `fully-kiosk.command.js` for unit testing; attaching it to the prototype is harmless and keeps a single source.

- [ ] **Step 6: Write the service entry point (index.js)**

Create `server/services/fully-kiosk/index.js`:

```javascript
const logger = require('../../utils/logger');
const FullyKioskHandler = require('./lib');

module.exports = function FullyKioskService(gladys, serviceId) {
  const fullyKioskHandler = new FullyKioskHandler(gladys, serviceId);

  /**
   * @public
   * @description Start the Fully Kiosk service.
   * @example
   * gladys.services['fully-kiosk'].start();
   */
  async function start() {
    logger.info('Starting Fully Kiosk service');
  }

  /**
   * @public
   * @description Stop the Fully Kiosk service.
   * @example
   * gladys.services['fully-kiosk'].stop();
   */
  async function stop() {
    logger.info('Stopping Fully Kiosk service');
  }

  return Object.freeze({
    start,
    stop,
    device: fullyKioskHandler,
  });
};
```

- [ ] **Step 7: Write package.json**

Create `server/services/fully-kiosk/package.json`:

```json
{
  "name": "gladys-fully-kiosk",
  "version": "1.0.0",
  "main": "index.js",
  "os": [
    "darwin",
    "linux",
    "win32"
  ],
  "cpu": [
    "x64",
    "arm",
    "arm64"
  ],
  "dependencies": {}
}
```

> `axios` is already a root dependency in `server/package.json` (used by many services); no per-service install needed.

- [ ] **Step 8: Register the service**

Modify `server/services/index.js` — add this line alongside the other `module.exports.*` entries (e.g. after the `mcp` line):

```javascript
module.exports['fully-kiosk'] = require('./fully-kiosk');
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: PASS (4 passing).

- [ ] **Step 10: Commit**

```bash
git add server/services/fully-kiosk server/services/index.js server/test/services/fully-kiosk
git commit -m "feat(fully-kiosk): add service scaffold, command helper and registration"
```

---

### Task 2: Backend control path — `setValue`

**Files:**
- Create: `server/services/fully-kiosk/lib/fully-kiosk.setValue.js`
- Modify: `server/services/fully-kiosk/lib/index.js` (bind `setValue`)
- Test: `server/test/services/fully-kiosk/lib/fully-kiosk.setValue.test.js`

**Interfaces:**
- Consumes: `sendCommand` (Task 1), `FULLY_COMMANDS`, `EXTERNAL_ID_PREFIX`.
- Produces: `FullyKioskHandler.prototype.setValue(device, deviceFeature, value)` → `Promise`. Maps the `<command>` segment of `deviceFeature.external_id` to a Fully command:
  - `screen`: `value` truthy → `screenOn`, else `screenOff`.
  - `brightness`: `setStringSetting` with `{ key: 'screenBrightness', value }`.
  - `load-url`: `loadUrl` with `{ url: value }`.
  - `tts`: `textToSpeech` with `{ text: value }`.
  - unknown command / bad prefix → throw `BadParameters`.

- [ ] **Step 1: Write the failing test**

Create `server/test/services/fully-kiosk/lib/fully-kiosk.setValue.test.js`:

```javascript
const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');

const device = {
  external_id: 'fully-kiosk:192.168.1.50',
  params: [{ name: 'PASSWORD', value: 'p' }],
};

const feature = (cmd) => ({ external_id: `fully-kiosk:192.168.1.50:${cmd}` });

describe('fully-kiosk setValue', () => {
  let handler;
  beforeEach(() => {
    handler = new FullyKioskHandler({}, 'service-id');
    handler.sendCommand = sinon.fake.resolves({ data: { status: 'OK' } });
  });

  it('should turn screen on for value 1', async () => {
    await handler.setValue(device, feature('screen'), 1);
    expect(handler.sendCommand.firstCall.args[1]).to.equal('screenOn');
  });

  it('should turn screen off for value 0', async () => {
    await handler.setValue(device, feature('screen'), 0);
    expect(handler.sendCommand.firstCall.args[1]).to.equal('screenOff');
  });

  it('should set brightness via setStringSetting', async () => {
    await handler.setValue(device, feature('brightness'), 200);
    expect(handler.sendCommand.firstCall.args[1]).to.equal('setStringSetting');
    expect(handler.sendCommand.firstCall.args[2]).to.deep.equal({ key: 'screenBrightness', value: 200 });
  });

  it('should load a url', async () => {
    await handler.setValue(device, feature('load-url'), 'http://gladys/dashboard');
    expect(handler.sendCommand.firstCall.args[1]).to.equal('loadUrl');
    expect(handler.sendCommand.firstCall.args[2]).to.deep.equal({ url: 'http://gladys/dashboard' });
  });

  it('should speak text', async () => {
    await handler.setValue(device, feature('tts'), 'Someone at the door');
    expect(handler.sendCommand.firstCall.args[1]).to.equal('textToSpeech');
    expect(handler.sendCommand.firstCall.args[2]).to.deep.equal({ text: 'Someone at the door' });
  });

  it('should throw BadParameters on unknown command', async () => {
    let error;
    try {
      await handler.setValue(device, feature('unknown'), 1);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    expect(error.constructor.name).to.equal('BadParameters');
  });

  it('should throw BadParameters on wrong prefix', async () => {
    let error;
    try {
      await handler.setValue(device, { external_id: 'tasmota:x:screen' }, 1);
    } catch (e) {
      error = e;
    }
    expect(error.constructor.name).to.equal('BadParameters');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: FAIL — `handler.setValue is not a function`.

- [ ] **Step 3: Write the implementation**

Create `server/services/fully-kiosk/lib/fully-kiosk.setValue.js`:

```javascript
const { BadParameters } = require('../../../utils/coreErrors');
const { EXTERNAL_ID_PREFIX, FULLY_COMMANDS } = require('./fully-kiosk.constants');

/**
 * @description Send a new value to a tablet feature over the Remote Admin REST API.
 * @param {object} device - The Gladys device (tablet).
 * @param {object} deviceFeature - The feature being written.
 * @param {string|number} value - The new value.
 * @returns {Promise} Resolves when the command was sent.
 * @example
 * await handler.setValue(device, deviceFeature, 1);
 */
async function setValue(device, deviceFeature, value) {
  const externalId = deviceFeature.external_id;
  const [prefix, , command] = externalId.split(':');
  if (prefix !== EXTERNAL_ID_PREFIX) {
    throw new BadParameters(`Fully Kiosk external_id is invalid: "${externalId}" should start with "${EXTERNAL_ID_PREFIX}:"`);
  }

  switch (command) {
    case 'screen':
      return this.sendCommand(device, value ? FULLY_COMMANDS.SCREEN_ON : FULLY_COMMANDS.SCREEN_OFF);
    case 'brightness':
      return this.sendCommand(device, FULLY_COMMANDS.SET_STRING_SETTING, { key: 'screenBrightness', value });
    case 'load-url':
      return this.sendCommand(device, FULLY_COMMANDS.LOAD_URL, { url: value });
    case 'tts':
      return this.sendCommand(device, FULLY_COMMANDS.TEXT_TO_SPEECH, { text: value });
    default:
      throw new BadParameters(`Fully Kiosk external_id is not managed: "${externalId}"`);
  }
}

module.exports = {
  setValue,
};
```

- [ ] **Step 4: Bind `setValue` on the handler**

Modify `server/services/fully-kiosk/lib/index.js` — add the require and prototype binding:

```javascript
const { setValue } = require('./fully-kiosk.setValue');
// ... after the existing prototype bindings:
FullyKioskHandler.prototype.setValue = setValue;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/services/fully-kiosk/lib server/test/services/fully-kiosk/lib/fully-kiosk.setValue.test.js
git commit -m "feat(fully-kiosk): map feature writes to Remote Admin commands (setValue)"
```

---

### Task 3: Backend state path — `poll`

**Files:**
- Create: `server/services/fully-kiosk/lib/fully-kiosk.poll.js`
- Modify: `server/services/fully-kiosk/lib/index.js` (bind `poll`)
- Test: `server/test/services/fully-kiosk/lib/fully-kiosk.poll.test.js`

**Interfaces:**
- Consumes: `getDeviceInfo` (Task 1), `EVENTS` from constants, `EXTERNAL_ID_PREFIX`.
- Produces: `FullyKioskHandler.prototype.poll(device)` → `Promise`. Calls `getDeviceInfo`, then emits `EVENTS.DEVICE.NEW_STATE` for each readable feature:
  - `screen` ← `info.isScreenOn ?? info.screenOn` → `1`/`0`.
  - `brightness` ← `info.screenBrightness` (integer).
  - `battery` ← `info.batteryLevel` (integer).
  - `charging` ← `info.isPlugged ?? info.plugged` → `1`/`0`.
  - On any HTTP error: log a warning and return without throwing (an offline tablet must not break the poll loop). Missing fields are skipped (not emitted).

> Implementation note: Fully's `deviceInfo` key names vary slightly by app version. This code reads both common spellings (`isScreenOn`/`screenOn`, `isPlugged`/`plugged`). During the first live test against a real tablet, capture the raw `deviceInfo` JSON and confirm these keys; adjust the two fallbacks if needed. This is the one field-name dependency in the plan.

- [ ] **Step 1: Write the failing test**

Create `server/test/services/fully-kiosk/lib/fully-kiosk.poll.test.js`:

```javascript
const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');
const { EVENTS } = require('../../../../utils/constants');

const device = { external_id: 'fully-kiosk:192.168.1.50', params: [{ name: 'PASSWORD', value: 'p' }] };

describe('fully-kiosk poll', () => {
  let handler;
  let emit;
  beforeEach(() => {
    emit = sinon.fake();
    handler = new FullyKioskHandler({ event: { emit } }, 'service-id');
  });

  it('should emit NEW_STATE for screen, brightness, battery and charging', async () => {
    handler.getDeviceInfo = sinon.fake.resolves({
      isScreenOn: true,
      screenBrightness: 180,
      batteryLevel: 92,
      isPlugged: false,
    });
    await handler.poll(device);

    const emitted = emit.getCalls().map((c) => c.args[1]);
    expect(emit.getCalls().every((c) => c.args[0] === EVENTS.DEVICE.NEW_STATE)).to.equal(true);
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:screen', state: 1 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:brightness', state: 180 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:battery', state: 92 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:charging', state: 0 });
  });

  it('should support alternate deviceInfo key spellings', async () => {
    handler.getDeviceInfo = sinon.fake.resolves({ screenOn: false, plugged: true, batteryLevel: 50 });
    await handler.poll(device);
    const emitted = emit.getCalls().map((c) => c.args[1]);
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:screen', state: 0 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:charging', state: 1 });
  });

  it('should not throw when the tablet is unreachable', async () => {
    handler.getDeviceInfo = sinon.fake.rejects(new Error('ECONNREFUSED'));
    await handler.poll(device); // must resolve, not reject
    expect(emit.called).to.equal(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: FAIL — `handler.poll is not a function`.

- [ ] **Step 3: Write the implementation**

Create `server/services/fully-kiosk/lib/fully-kiosk.poll.js`:

```javascript
const logger = require('../../../utils/logger');
const { EVENTS } = require('../../../utils/constants');

/**
 * @description Read a boolean from deviceInfo supporting two key spellings.
 * @param {object} info - The deviceInfo object.
 * @param {string} keyA - Primary key name.
 * @param {string} keyB - Fallback key name.
 * @returns {boolean|undefined} The boolean value or undefined if absent.
 * @example
 * readBool(info, 'isScreenOn', 'screenOn');
 */
function readBool(info, keyA, keyB) {
  if (info[keyA] !== undefined) {
    return Boolean(info[keyA]);
  }
  if (info[keyB] !== undefined) {
    return Boolean(info[keyB]);
  }
  return undefined;
}

/**
 * @description Poll a tablet's state and emit new feature states.
 * @param {object} device - The Gladys device (tablet).
 * @returns {Promise} Resolves once state has been emitted (or on handled error).
 * @example
 * await handler.poll(device);
 */
async function poll(device) {
  let info;
  try {
    info = await this.getDeviceInfo(device);
  } catch (e) {
    logger.warn(`Fully Kiosk: unable to poll device ${device.external_id}`);
    logger.debug(e);
    return;
  }

  const [prefix, ip] = device.external_id.split(':');
  const base = `${prefix}:${ip}`;
  const emit = (command, state) => {
    this.gladys.event.emit(EVENTS.DEVICE.NEW_STATE, {
      device_feature_external_id: `${base}:${command}`,
      state,
    });
  };

  const screenOn = readBool(info, 'isScreenOn', 'screenOn');
  if (screenOn !== undefined) {
    emit('screen', screenOn ? 1 : 0);
  }
  if (info.screenBrightness !== undefined) {
    emit('brightness', parseInt(info.screenBrightness, 10));
  }
  if (info.batteryLevel !== undefined) {
    emit('battery', parseInt(info.batteryLevel, 10));
  }
  const plugged = readBool(info, 'isPlugged', 'plugged');
  if (plugged !== undefined) {
    emit('charging', plugged ? 1 : 0);
  }
}

module.exports = {
  poll,
};
```

- [ ] **Step 4: Bind `poll` on the handler**

Modify `server/services/fully-kiosk/lib/index.js` — add the require and prototype binding:

```javascript
const { poll } = require('./fully-kiosk.poll');
// ... after the existing prototype bindings:
FullyKioskHandler.prototype.poll = poll;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/fully-kiosk/lib server/test/services/fully-kiosk/lib/fully-kiosk.poll.test.js
git commit -m "feat(fully-kiosk): poll deviceInfo and emit screen/brightness/battery/charging state"
```

---

### Task 4: Backend controller — test-connection endpoint

**Files:**
- Create: `server/services/fully-kiosk/api/fully-kiosk.controller.js`
- Modify: `server/services/fully-kiosk/index.js` (expose `controllers`)
- Test: `server/test/services/fully-kiosk/api/fully-kiosk.controller.test.js`

**Interfaces:**
- Consumes: `FullyKioskHandler.getDeviceInfo` (Task 1), `asyncMiddleware`.
- Produces: HTTP route `POST /api/v1/service/fully-kiosk/tablet/test`. Request body is a tablet object shaped like `{ params: [{name,value}...], external_id? }`. Response JSON: `{ success: true, deviceName, batteryLevel }` on reach, or `{ success: false, message }` on failure (HTTP 200 either way, so the front-end can render the result). Route is `authenticated: true, admin: true`.

- [ ] **Step 1: Write the failing test**

Create `server/test/services/fully-kiosk/api/fully-kiosk.controller.test.js`:

```javascript
const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskController = require('../../../../services/fully-kiosk/api/fully-kiosk.controller');

const buildRes = () => {
  const res = {};
  res.json = sinon.fake.returns(res);
  res.status = sinon.fake.returns(res);
  return res;
};

describe('fully-kiosk controller: test connection', () => {
  it('should return success with device info when reachable', async () => {
    const handler = { getDeviceInfo: sinon.fake.resolves({ deviceName: 'Lenovo Tab', batteryLevel: 88 }) };
    const controller = FullyKioskController({}, handler);
    const route = controller['post /api/v1/service/fully-kiosk/tablet/test'];
    const req = { body: { params: [{ name: 'PASSWORD', value: 'p' }], external_id: 'fully-kiosk:1.2.3.4' } };
    const res = buildRes();
    await route.controller(req, res);
    expect(res.json.firstCall.args[0]).to.deep.equal({ success: true, deviceName: 'Lenovo Tab', batteryLevel: 88 });
  });

  it('should return success:false with a message when unreachable', async () => {
    const handler = { getDeviceInfo: sinon.fake.rejects(new Error('ECONNREFUSED')) };
    const controller = FullyKioskController({}, handler);
    const route = controller['post /api/v1/service/fully-kiosk/tablet/test'];
    const res = buildRes();
    await route.controller({ body: { params: [] } }, res);
    expect(res.json.firstCall.args[0].success).to.equal(false);
    expect(res.json.firstCall.args[0].message).to.be.a('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: FAIL — `Cannot find module '.../api/fully-kiosk.controller'`.

- [ ] **Step 3: Write the controller**

Create `server/services/fully-kiosk/api/fully-kiosk.controller.js`:

```javascript
const asyncMiddleware = require('../../../api/middlewares/asyncMiddleware');

module.exports = function FullyKioskController(gladys, fullyKioskHandler) {
  /**
   * @api {post} /api/v1/service/fully-kiosk/tablet/test Test connection to a tablet.
   * @apiName testConnection
   * @apiGroup FullyKiosk
   */
  async function testConnection(req, res) {
    try {
      const info = await fullyKioskHandler.getDeviceInfo(req.body);
      res.json({
        success: true,
        deviceName: info.deviceName,
        batteryLevel: info.batteryLevel,
      });
    } catch (e) {
      res.json({ success: false, message: e.message });
    }
  }

  return {
    'post /api/v1/service/fully-kiosk/tablet/test': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(testConnection),
    },
  };
};
```

- [ ] **Step 4: Expose controllers from the service**

Modify `server/services/fully-kiosk/index.js`:

```javascript
const FullyKioskController = require('./api/fully-kiosk.controller');
// ... inside the module.exports function, after creating fullyKioskHandler,
// change the returned object to include controllers:
  return Object.freeze({
    start,
    stop,
    device: fullyKioskHandler,
    controllers: FullyKioskController(gladys, fullyKioskHandler),
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm_config_service=fully-kiosk npm run test-service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/fully-kiosk/api server/services/fully-kiosk/index.js server/test/services/fully-kiosk/api
git commit -m "feat(fully-kiosk): add tablet test-connection controller endpoint"
```

---

### Task 5: Front-end registration — catalog entry, route, i18n, logo

**Files:**
- Modify: `front/src/config/integrations/devices.json` (add catalog card)
- Modify: `front/src/components/app.jsx` (import + register the page route)
- Modify: `front/src/config/i18n/en.json` (add `integration.fully-kiosk.*` strings)
- Modify: `front/src/config/i18n/fr.json` (add French strings)
- Create: `front/src/assets/integrations/cover/fully-kiosk.jpg` (cover image; a placeholder is acceptable for v1)

**Interfaces:**
- Produces: a `/dashboard/integration/device/fully-kiosk` route rendering `FullyKioskPage` (built in Task 6), and a catalog card keyed `fully-kiosk`.

- [ ] **Step 1: Add the catalog entry**

Modify `front/src/config/integrations/devices.json` — add an object to the array (keep alphabetical-ish placement near other local integrations):

```json
{
  "key": "fully-kiosk",
  "img": "/assets/integrations/cover/fully-kiosk.jpg",
  "local": true
}
```

- [ ] **Step 2: Register the route in app.jsx**

Modify `front/src/components/app.jsx` — add an import near the other integration imports (e.g. by the Tasmota block around line 114):

```javascript
// Fully Kiosk
import FullyKioskPage from '../routes/integration/all/fully-kiosk';
```

And add the route inside the `<Router>` block (near the other integration device routes around line 312):

```javascript
        <FullyKioskPage path="/dashboard/integration/device/fully-kiosk" />
```

- [ ] **Step 3: Add English i18n strings**

Modify `front/src/config/i18n/en.json` — add a `"fully-kiosk"` block under the existing `"integration"` object (place it next to other integration keys). Copy verbatim:

```json
"fully-kiosk": {
  "title": "Fully Kiosk Browser",
  "description": "Control and monitor your dashboard tablet",
  "deviceTab": "Tablets",
  "addTablet": "Add a tablet",
  "emptyTitle": "No tablet configured",
  "emptyDescription": "Add your first Fully Kiosk tablet to control its screen and monitor its state.",
  "nameLabel": "Tablet name",
  "namePlaceholder": "Living room dashboard",
  "ipLabel": "IP address",
  "ipPlaceholder": "192.168.1.50",
  "portLabel": "Port",
  "passwordLabel": "Remote Admin password",
  "testConnection": "Test connection",
  "testSuccess": "Connected to {{deviceName}} (battery {{batteryLevel}}%)",
  "testFailure": "Unable to reach the tablet: {{message}}",
  "saveButton": "Save",
  "deleteButton": "Delete"
}
```

- [ ] **Step 4: Add French i18n strings**

Modify `front/src/config/i18n/fr.json` — add the matching `"fully-kiosk"` block under `"integration"`:

```json
"fully-kiosk": {
  "title": "Fully Kiosk Browser",
  "description": "Contrôlez et surveillez votre tablette tableau de bord",
  "deviceTab": "Tablettes",
  "addTablet": "Ajouter une tablette",
  "emptyTitle": "Aucune tablette configurée",
  "emptyDescription": "Ajoutez votre première tablette Fully Kiosk pour contrôler son écran et surveiller son état.",
  "nameLabel": "Nom de la tablette",
  "namePlaceholder": "Tableau de bord du salon",
  "ipLabel": "Adresse IP",
  "ipPlaceholder": "192.168.1.50",
  "portLabel": "Port",
  "passwordLabel": "Mot de passe Remote Admin",
  "testConnection": "Tester la connexion",
  "testSuccess": "Connecté à {{deviceName}} (batterie {{batteryLevel}} %)",
  "testFailure": "Impossible de joindre la tablette : {{message}}",
  "saveButton": "Enregistrer",
  "deleteButton": "Supprimer"
}
```

- [ ] **Step 5: Add a cover image**

Create `front/src/assets/integrations/cover/fully-kiosk.jpg`. For v1 a placeholder is fine — copy an existing cover so the card renders:

```bash
cp front/src/assets/integrations/cover/tasmota.jpg front/src/assets/integrations/cover/fully-kiosk.jpg
```

> Replace with a real Fully Kiosk cover before release.

- [ ] **Step 6: Verify the front-end builds**

Run: `cd front && npm run build`
Expected: build succeeds (note: `FullyKioskPage` is created in Task 6; if executing tasks strictly in order, defer this build check to after Task 6, or stub `front/src/routes/integration/all/fully-kiosk/index.js` to export an empty component first).

- [ ] **Step 7: Commit**

```bash
git add front/src/config/integrations/devices.json front/src/components/app.jsx front/src/config/i18n/en.json front/src/config/i18n/fr.json front/src/assets/integrations/cover/fully-kiosk.jpg
git commit -m "feat(fully-kiosk): register front-end integration card, route and i18n"
```

---

### Task 6: Front-end integration page — list, add/edit form, actions

**Files:**
- Create: `front/src/routes/integration/all/fully-kiosk/index.js`
- Create: `front/src/routes/integration/all/fully-kiosk/actions.js`
- Create: `front/src/routes/integration/all/fully-kiosk/FullyKioskPage.jsx`
- Create: `front/src/routes/integration/all/fully-kiosk/DeviceTab.jsx`
- Create: `front/src/routes/integration/all/fully-kiosk/TabletBox.jsx`
- Create: `front/src/routes/integration/all/fully-kiosk/EmptyState.jsx`
- Create: `front/src/routes/integration/all/fully-kiosk/style.css`

**Interfaces:**
- Consumes: backend `POST /api/v1/device` (generic device create), `DELETE /api/v1/device/:selector`, `POST /api/v1/service/fully-kiosk/tablet/test` (Task 4), `GET /api/v1/service/fully-kiosk/device` (list devices by service — the standard Gladys endpoint used by other integrations; confirm the exact query the app already uses for `getRtspCameras`/`getTasmotaDevices` and mirror it).
- Produces: the `FullyKioskPage` default export used by Task 5's route. Store keys: `fullyKioskTablets`, `fullyKioskGetStatus`.
- Device object built for create — must match the backend feature scheme exactly:
  - `external_id`/`selector`: `fully-kiosk:<ip>`
  - `should_poll: true`, `poll_frequency: EVERY_30_SECONDS`
  - features (each `external_id`/`selector` = `fully-kiosk:<ip>:<command>`):
    - `screen` — `SWITCH` / `SWITCH.BINARY`, read/write, min 0 max 1
    - `brightness` — `SWITCH` / `SWITCH.DIMMER`, read/write, min 0 max 255
    - `battery` — `BATTERY` / `BATTERY.INTEGER`, read-only, unit `PERCENT`, min 0 max 100
    - `charging` — `SWITCH` / `SWITCH.BINARY`, read-only, min 0 max 1
    - `load-url` — `TEXT` / `TEXT.TEXT`, read/write
    - `tts` — `TEXT` / `TEXT.TEXT`, read/write
  - `params`: `IP_ADDRESS`, `PORT` (`"2323"`), `PASSWORD`

> Study `front/src/routes/integration/all/rtsp-camera/actions.js` (the `addCamera`/`saveCamera`/`deleteCamera`/`testConnection` methods) and `index.js` before writing — this task mirrors that structure exactly, swapping the camera feature for the six tablet features above.

- [ ] **Step 1: Write the actions module**

Create `front/src/routes/integration/all/fully-kiosk/actions.js`:

```javascript
import { RequestStatus } from '../../../../utils/consts';
import update from 'immutability-helper';
import uuid from 'uuid';
import {
  DEVICE_POLL_FREQUENCIES,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS
} from '../../../../../../server/utils/constants';
import createActionsIntegration from '../../../../actions/integration';

function createActions(store) {
  const integrationActions = createActionsIntegration(store);

  const buildTabletFeatures = (baseId) => [
    {
      name: 'Screen',
      selector: `${baseId}:screen`,
      external_id: `${baseId}:screen`,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      keep_history: true,
      has_feedback: false,
      min: 0,
      max: 1
    },
    {
      name: 'Brightness',
      selector: `${baseId}:brightness`,
      external_id: `${baseId}:brightness`,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.DIMMER,
      read_only: false,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 255
    },
    {
      name: 'Battery',
      selector: `${baseId}:battery`,
      external_id: `${baseId}:battery`,
      category: DEVICE_FEATURE_CATEGORIES.BATTERY,
      type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      read_only: true,
      keep_history: true,
      has_feedback: false,
      min: 0,
      max: 100
    },
    {
      name: 'Charging',
      selector: `${baseId}:charging`,
      external_id: `${baseId}:charging`,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: true,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 1
    },
    {
      name: 'Load URL',
      selector: `${baseId}:load-url`,
      external_id: `${baseId}:load-url`,
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: false,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 0
    },
    {
      name: 'Text to speech',
      selector: `${baseId}:tts`,
      external_id: `${baseId}:tts`,
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: false,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 0
    }
  ];

  const actions = {
    async getTablets(state) {
      store.setState({ fullyKioskGetStatus: RequestStatus.Getting });
      try {
        const tablets = await state.httpClient.get('/api/v1/service/fully-kiosk/device');
        store.setState({ fullyKioskTablets: tablets, fullyKioskGetStatus: RequestStatus.Success });
      } catch (e) {
        store.setState({ fullyKioskGetStatus: RequestStatus.Error });
      }
    },
    async addTablet(state) {
      const uniqueId = uuid.v4();
      await integrationActions.getIntegrationByName(state, 'fully-kiosk');
      const newTablet = {
        id: uniqueId,
        name: null,
        should_poll: true,
        poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_30_SECONDS,
        external_id: null,
        service_id: store.getState().currentIntegration.id,
        features: [],
        params: [
          { name: 'IP_ADDRESS', value: null },
          { name: 'PORT', value: '2323' },
          { name: 'PASSWORD', value: null }
        ]
      };
      const fullyKioskTablets = update(state.fullyKioskTablets || [], { $push: [newTablet] });
      store.setState({ fullyKioskTablets });
    },
    updateTabletField(state, index, field, value) {
      const fullyKioskTablets = update(state.fullyKioskTablets, {
        [index]: { [field]: { $set: value } }
      });
      store.setState({ fullyKioskTablets });
    },
    updateTabletParam(state, index, paramName, value) {
      const tablet = state.fullyKioskTablets[index];
      const paramIndex = tablet.params.findIndex((p) => p.name === paramName);
      const fullyKioskTablets = update(state.fullyKioskTablets, {
        [index]: { params: { [paramIndex]: { value: { $set: value } } } }
      });
      store.setState({ fullyKioskTablets });
    },
    async saveTablet(state, index) {
      const tablet = { ...state.fullyKioskTablets[index] };
      const ip = tablet.params.find((p) => p.name === 'IP_ADDRESS').value;
      const baseId = `fully-kiosk:${ip}`;
      tablet.external_id = baseId;
      tablet.selector = baseId;
      tablet.features = buildTabletFeatures(baseId);
      let saved = await state.httpClient.post('/api/v1/device', tablet);
      const fullyKioskTablets = update(state.fullyKioskTablets, { [index]: { $set: saved } });
      store.setState({ fullyKioskTablets });
    },
    async deleteTablet(state, index) {
      const tablet = state.fullyKioskTablets[index];
      if (tablet.created_at) {
        await state.httpClient.delete(`/api/v1/device/${tablet.selector}`);
      }
      const fullyKioskTablets = update(state.fullyKioskTablets, { $splice: [[index, 1]] });
      store.setState({ fullyKioskTablets });
    },
    async testConnection(state, index) {
      const tablet = state.fullyKioskTablets[index];
      const result = await state.httpClient.post('/api/v1/service/fully-kiosk/tablet/test', tablet);
      const fullyKioskTablets = update(state.fullyKioskTablets, {
        [index]: { testResult: { $set: result } }
      });
      store.setState({ fullyKioskTablets });
    }
  };
  // Merge the shared integration actions (e.g. getIntegrationByName) with these.
  return Object.assign({}, integrationActions, actions);
}

export default createActions;
```

> **Confirmed against `rtsp-camera/actions.js`:** `RequestStatus` comes from `../../../../utils/consts`; feature constants import from `../../../../../../server/utils/constants`; integration actions from `../../../../actions/integration` (merged into the returned actions via `Object.assign`); the device-list endpoint is `GET /api/v1/service/fully-kiosk/device`. These paths in the snippet above are correct as written.

- [ ] **Step 2: Write the page wrapper**

Create `front/src/routes/integration/all/fully-kiosk/FullyKioskPage.jsx`:

```javascript
import { Text } from 'preact-i18n';
import cx from 'classnames';

const FullyKioskPage = ({ children, user }) => (
  <div class="page">
    <div class="page-main">
      <div class="my-3 my-md-5">
        <div class="container">
          <div class="page-header">
            <h1 class="page-title">
              <Text id="integration.fully-kiosk.title" />
            </h1>
          </div>
          <div class="row">
            <div class="col-lg-12">
              <div class="card">
                <div class={cx('card-body')}>{children}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default FullyKioskPage;
```

> Match the exact page chrome to `rtsp-camera`'s `RtspCamera.jsx` (tabs, header layout) — copy its structure and swap text ids to `integration.fully-kiosk.*`. The snippet above is a minimal valid version.

- [ ] **Step 3: Write the EmptyState**

Create `front/src/routes/integration/all/fully-kiosk/EmptyState.jsx`:

```javascript
import { Text } from 'preact-i18n';

const EmptyState = () => (
  <div class="text-center py-4">
    <h3>
      <Text id="integration.fully-kiosk.emptyTitle" />
    </h3>
    <p class="text-muted">
      <Text id="integration.fully-kiosk.emptyDescription" />
    </p>
  </div>
);

export default EmptyState;
```

- [ ] **Step 4: Write the TabletBox (add/edit form)**

Create `front/src/routes/integration/all/fully-kiosk/TabletBox.jsx`:

```javascript
import { Text, Localizer } from 'preact-i18n';
import { Component } from 'preact';

class TabletBox extends Component {
  getParam = (name) => {
    const param = this.props.tablet.params.find((p) => p.name === name);
    return param ? param.value : '';
  };

  updateName = (e) => this.props.updateTabletField(this.props.tabletIndex, 'name', e.target.value);
  updateIp = (e) => this.props.updateTabletParam(this.props.tabletIndex, 'IP_ADDRESS', e.target.value);
  updatePort = (e) => this.props.updateTabletParam(this.props.tabletIndex, 'PORT', e.target.value);
  updatePassword = (e) => this.props.updateTabletParam(this.props.tabletIndex, 'PASSWORD', e.target.value);

  save = () => this.props.saveTablet(this.props.tabletIndex);
  remove = () => this.props.deleteTablet(this.props.tabletIndex);
  test = () => this.props.testConnection(this.props.tabletIndex);

  render({ tablet }) {
    const result = tablet.testResult;
    return (
      <div class="card">
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.nameLabel" />
            </label>
            <Localizer>
              <input
                type="text"
                class="form-control"
                value={tablet.name || ''}
                onInput={this.updateName}
                placeholder={<Text id="integration.fully-kiosk.namePlaceholder" />}
              />
            </Localizer>
          </div>
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.ipLabel" />
            </label>
            <Localizer>
              <input
                type="text"
                class="form-control"
                value={this.getParam('IP_ADDRESS') || ''}
                onInput={this.updateIp}
                placeholder={<Text id="integration.fully-kiosk.ipPlaceholder" />}
              />
            </Localizer>
          </div>
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.portLabel" />
            </label>
            <input type="text" class="form-control" value={this.getParam('PORT') || '2323'} onInput={this.updatePort} />
          </div>
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.passwordLabel" />
            </label>
            <input
              type="password"
              class="form-control"
              value={this.getParam('PASSWORD') || ''}
              onInput={this.updatePassword}
            />
          </div>
          {result && result.success && (
            <div class="alert alert-success">
              <Text
                id="integration.fully-kiosk.testSuccess"
                fields={{ deviceName: result.deviceName, batteryLevel: result.batteryLevel }}
              />
            </div>
          )}
          {result && !result.success && (
            <div class="alert alert-danger">
              <Text id="integration.fully-kiosk.testFailure" fields={{ message: result.message }} />
            </div>
          )}
          <div class="btn-list">
            <button class="btn btn-outline-primary" onClick={this.test}>
              <Text id="integration.fully-kiosk.testConnection" />
            </button>
            <button class="btn btn-success" onClick={this.save}>
              <Text id="integration.fully-kiosk.saveButton" />
            </button>
            <button class="btn btn-outline-danger" onClick={this.remove}>
              <Text id="integration.fully-kiosk.deleteButton" />
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default TabletBox;
```

- [ ] **Step 5: Write the DeviceTab (list + add button)**

Create `front/src/routes/integration/all/fully-kiosk/DeviceTab.jsx`:

```javascript
import { Text } from 'preact-i18n';
import EmptyState from './EmptyState';
import TabletBox from './TabletBox';

const DeviceTab = (props) => {
  const tablets = props.fullyKioskTablets || [];
  return (
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>
          <Text id="integration.fully-kiosk.deviceTab" />
        </h3>
        <button class="btn btn-primary" onClick={() => props.addTablet()}>
          <Text id="integration.fully-kiosk.addTablet" />
        </button>
      </div>
      {tablets.length === 0 && <EmptyState />}
      <div class="row">
        {tablets.map((tablet, index) => (
          <div class="col-md-6" key={tablet.id || tablet.selector}>
            <TabletBox
              tablet={tablet}
              tabletIndex={index}
              updateTabletField={props.updateTabletField}
              updateTabletParam={props.updateTabletParam}
              saveTablet={props.saveTablet}
              deleteTablet={props.deleteTablet}
              testConnection={props.testConnection}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeviceTab;
```

- [ ] **Step 6: Write the connected index.js**

Create `front/src/routes/integration/all/fully-kiosk/index.js`:

```javascript
import { Component } from 'preact';
import { connect } from 'unistore/preact';
import actions from './actions';
import FullyKioskPage from './FullyKioskPage';
import DeviceTab from './DeviceTab';

class FullyKioskIntegration extends Component {
  componentWillMount() {
    this.props.getTablets();
  }

  render(props) {
    return (
      <FullyKioskPage user={props.user}>
        <DeviceTab {...props} />
      </FullyKioskPage>
    );
  }
}

export default connect('user,fullyKioskTablets,fullyKioskGetStatus', actions)(FullyKioskIntegration);
```

- [ ] **Step 7: Write minimal styles**

Create `front/src/routes/integration/all/fully-kiosk/style.css`:

```css
.fully-kiosk-tablet-card {
  margin-bottom: 1rem;
}
```

- [ ] **Step 8: Build the front-end**

Run: `cd front && npm run build`
Expected: build succeeds with no import/lint errors. Fix any import-path mismatches surfaced against the real `rtsp-camera` reference (this is the most likely failure point — resolve by matching that file's imports exactly).

- [ ] **Step 9: Manual verification (real behavior)**

Start Gladys (or the front dev server against a running backend), open **Integrations → Fully Kiosk Browser**, add a tablet (name, the tablet's LAN IP, Remote Admin password), click **Test connection** → expect the success alert with device name + battery. Save → the device with its six features appears under Devices. Toggle the **Screen** feature → the tablet screen turns on/off. Wait ~30s → battery/charging/screen values refresh from polling.

- [ ] **Step 10: Commit**

```bash
git add front/src/routes/integration/all/fully-kiosk
git commit -m "feat(fully-kiosk): front-end page to add, test and manage tablets"
```

---

## Notes for the implementer

- **Field-name confirmation (Task 3):** on first contact with a real tablet, log the raw `deviceInfo` JSON and confirm `isScreenOn`/`screenOn`, `isPlugged`/`plugged`, `screenBrightness`, `batteryLevel`, `deviceName`. The code already handles both boolean spellings; adjust only if a key differs.
- **Front-end import paths (Tasks 5–6):** the `rtsp-camera` integration is the authoritative template. Where this plan and that file differ on an import path or store-action helper, follow `rtsp-camera`.
- **Out of scope (do not build):** MQTT event stream, motion feature, restart/reboot actions, Fully Cloud API, LAN auto-discovery. These are phase-2 items recorded in the design spec.
