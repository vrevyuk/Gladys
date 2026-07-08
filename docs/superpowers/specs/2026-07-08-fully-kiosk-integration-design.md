# Fully Kiosk Browser Integration — Design

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation plan
**Author:** Vitalii Reviuk

## Goal

Add a Gladys integration for [Fully Kiosk Browser](https://www.fully-kiosk.com/) so a dashboard
tablet can be **controlled and monitored** from Gladys. Primary use cases (in priority order):

1. **Screen control** — turn the tablet screen on/off from Gladys scenes (wake the dashboard on
   motion, sleep it at night to protect the panel).
2. **Monitor tablet state** — pull battery level, charging state, and screen state into Gladys as
   device features usable in scenes and charts.
3. **Push content** — remotely load a URL and trigger text-to-speech / play a sound on the tablet.

Device management/recovery (restart app, reboot) is explicitly **out of v1 scope** but noted as a
cheap follow-up.

## Key facts driving the design

- **Fully exposes a local Remote Admin REST API** at `http://<tablet-ip>:2323/?cmd=<command>&password=<pw>`.
  Commands include `screenOn`, `screenOff`, `setStringSetting` (e.g. `screenBrightness` 0–255),
  `loadUrl`, `textToSpeech`, `playSound`, `restartApp`, `rebootDevice`, and `deviceInfo` (returns
  JSON with `batteryLevel`, `isPlugged`, `isScreenOn`, model, motion, etc.).
- **Real-time event push in Fully is over MQTT, not webhooks.** Fully publishes events
  (`onMotion`, `screenOn`, `screenOff`, `pluggedIn`, `unplugged`, …) to topics like
  `fully/event/onMotion/<deviceId>`. Commands are still sent via REST; only the inbound event
  stream is MQTT. There is **no "call this URL on event"** feature.
- **Gladys' integration system** is a self-contained `server/services/<name>/` folder
  (`index.js` + `lib/` handler + `api/` controller) plus a front-end page under
  `front/src/routes/integration/all/<name>/`. Gladys **core drives two paths per device**:
  `setValue(device, feature, value)` for control, and `poll(device)` for state refresh on an
  interval. The `tasmota` integration is the closest analog (HTTP device, polled, exposes
  features).

## Scope decisions

- **Connectivity: local network only.** Gladys talks directly to each tablet at
  `http://<ip>:2323`. Matches Gladys' local-first philosophy; no Fully Cloud account, no cloud
  dependency. Requires tablets to have stable LAN IPs.
- **Onboarding: manual add by IP + Remote Admin password.** No LAN auto-discovery in v1.
- **State updates: polling only in v1.** `deviceInfo` polled every ~30–60s. MQTT event stream is
  **phase 2**. Wake-on-motion in v1 is driven by an existing Gladys motion sensor (PIR/Zigbee) in
  a scene that issues `screenOn` — no Fully MQTT setup required.

## Architecture

New integration `server/services/fully-kiosk/`, mirroring `tasmota`:

```
server/services/fully-kiosk/
  index.js                       # FullyKioskService(gladys, serviceId): start/stop, exposes handler + controllers
  package.json                   # os/cpu, axios dependency
  lib/
    index.js                     # FullyKioskHandler prototype wiring
    fully-kiosk.setValue.js      # control path: feature -> REST command
    fully-kiosk.poll.js          # polling path: deviceInfo -> saveState
    fully-kiosk.command.js       # low-level axios GET helper (buildUrl + auth + json)
    fully-kiosk.constants.js     # command names, external_id prefix, param names
    features/                    # feature templates (screen, brightness, battery, charging, motion)
  api/
    fully-kiosk.controller.js    # test-connection / deviceInfo endpoint
```

Front-end: `front/src/routes/integration/all/fully-kiosk/` (integration page + "add tablet" form
+ "test connection"), registered in the front integration list, with i18n strings and logo asset.

Uses `axios` — the API is plain HTTP GET, no third-party SDK.

### Data model — a tablet is a Gladys device

Each tablet = one Gladys **device**, added manually with: name, IP address, Remote Admin password
(stored as a device param; password param should be treated as a secret). `external_id` scheme:
`fully-kiosk:<ip>:<command>` for features.

**Features:**

| Feature | Type / category | Direction | REST mapping |
|---|---|---|---|
| Screen | binary (switch) | read/write | write `screenOn` / `screenOff`; read from `deviceInfo.isScreenOn` |
| Brightness | integer (dimmer, 0–255) | read/write | write `setStringSetting key=screenBrightness`; read from `deviceInfo` |
| Battery | integer (%) | read | `deviceInfo.batteryLevel` |
| Charging | binary | read | `deviceInfo.isPlugged` |
| Motion | binary | read | `deviceInfo` motion field (near-real-time in phase 2 via MQTT) |

**Push-content actions**, exposed as writable features so scenes can drive them:

- **Load URL** — writable text feature → `loadUrl?url=<value>`
- **Text-to-speech** — writable text feature → `textToSpeech?text=<value>`
- **Play sound** (optional) — writable text feature → `playSound?url=<value>`

### Control path — `lib/fully-kiosk.setValue.js`

Core calls `setValue(device, deviceFeature, value)` when a feature is written (scene / dashboard /
API). Implementation:

1. Parse `deviceFeature.external_id` → `fully-kiosk:<ip>:<command>`. Validate prefix and IP.
2. Look up the feature template to map the Gladys value → REST command + params
   (e.g. binary `1`→`screenOn`, `0`→`screenOff`; brightness value → `setStringSetting`).
3. Read the tablet's IP + password from device params.
4. `axios.get` the Remote Admin URL. Handle non-200 / unreachable gracefully (log, do not crash).

### Polling path — `lib/fully-kiosk.poll.js`

Core polls each device on its configured interval. Implementation:

1. Read IP + password from device params.
2. `axios.get` `cmd=deviceInfo&type=json`.
3. Parse JSON and `gladys.device.saveState(...)` for each read feature: battery, screen state,
   charging, motion.
4. On failure, log and leave last-known state (do not throw).

### Onboarding UI + controller

- Front-end integration page: list existing tablets, "Add tablet" form (name, IP, password),
  **Test connection** button.
- `api/fully-kiosk.controller.js`: a test/`deviceInfo` endpoint that calls the tablet and returns
  reachable + basic info (model, battery). Authenticated; admin for mutating actions.
- Adding a tablet creates the Gladys device (with the feature set above) via the existing device
  API, storing IP + password as params.

### Scenes

Because Screen and Brightness are writable features and Load URL / TTS are writable actions, all of
it is usable in Gladys scenes with no extra work:

- *PIR motion → set tablet Screen = on* (v1 wake-on-motion).
- *23:00 → Screen = off.*
- *Doorbell → Load URL = camera view + TTS "someone at the door".*

## Phase 2 (noted, not built in v1)

MQTT event subscriber for instant state:

- Reuse Gladys' existing MQTT service (broker already shipped).
- Subscribe to `fully/event/#`; map `onMotion` / `screenOn` / `screenOff` / `pluggedIn` /
  `unplugged` → `saveState` in real time.
- Requires each tablet configured under Settings → Other Settings → MQTT Integration Plus to
  publish to the Gladys broker.
- Slow polling remains as a fallback for battery/brightness.

Also cheap follow-ups: **Restart app** (`restartApp`) and **Reboot device** (`rebootDevice`) as
service actions.

## Error handling

- All tablet HTTP calls wrapped with timeouts; unreachable tablet logs a warning and preserves
  last-known state rather than throwing (a napping/offline tablet must not break polling of others).
- Invalid `external_id` or unmapped command → `BadParameters` (mirrors tasmota).
- Wrong password → surfaced via the Test connection endpoint at onboarding time.

## Testing

Per the example service's guidance, use `proxyquire` to mock `axios` (no real network calls):

- `setValue`: value → REST command mapping for screen (on/off), brightness, loadUrl, TTS;
  invalid `external_id` throws `BadParameters`.
- `poll`: `deviceInfo` JSON → correct `saveState` calls for battery / screen / charging / motion;
  unreachable tablet does not throw.
- Controller: test-connection endpoint returns reachable/info on success and a clean error on
  failure.

## Out of scope for v1

- Fully Cloud REST API (off-LAN control).
- LAN auto-discovery of tablets.
- MQTT real-time events (phase 2).
- Restart app / reboot device actions (cheap follow-up).
- Managing Fully settings beyond brightness (the API can set any setting; not exposed in v1).

## References

- Fully Cloud REST API (v1.5 PDF): https://www.fully-kiosk.com/files/2024/09/Fully-Cloud-API-1.5.pdf
- Fully Kiosk REST API reference: https://www.fully-kiosk.com/en/#rest
- Fully Kiosk + MQTT (HA thread): https://community.home-assistant.io/t/fully-kiosk-browser-now-supports-mqtt/135858
- ioBroker fully-mqtt docs: https://github.com/Acgua/ioBroker.fully-mqtt/blob/main/docs/en/README.md
- HA REST API writeup: https://kleypot.com/fully-kiosk-rest-api-integration-in-home-assistant/
