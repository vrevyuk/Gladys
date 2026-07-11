# Ukrainian Localization for Gladys UI — Design

**Date:** 2026-07-11
**Branch:** `vitalii/ukrainian-translation` (PR against `vitalii/develop`)
**Precedent:** German localization PR #1998 and follow-ups (#2249)

## Goal

Add Ukrainian (`uk`) as a fully supported UI language in Gladys, including
server-side chat brain replies.

## Translation rules

- Source of truth: `front/src/config/i18n/en.json` (~5,000 lines).
- Tone: formal «ви» throughout.
- Exact key parity with `en.json` — enforced by CI via
  `npm run compare-translations` (`comparejson` + `cli/check_translations.js`).
- Preserve template placeholders (`%field%`, `{{var}}`) and any embedded
  markup exactly as in English.
- Keep product, protocol, and brand names in Latin script (Zigbee2MQTT,
  MQTT, Philips Hue, Sonos, Node-RED, Z-Wave, Bluetooth vendor names, etc.).
- Translation authored by Claude in full; author (native speaker)
  spot-checks key screens afterwards.

## Front-end changes

| File | Change |
|------|--------|
| `front/src/config/i18n/uk.json` | New: full Ukrainian translation of `en.json` |
| `front/src/config/i18n/index.js` | Register `uk` in the exported language map |
| `front/src/index.js` | `import 'dayjs/locale/uk'` |
| `front/src/components/user/profile.jsx` | Add Ukrainian `<option>`; add `profile.ukrainian` label key to en/fr/de/uk JSON files |
| `front/src/routes/signup/2-create-account-local/index.js` | Detect `uk` browser locale at signup |
| `front/src/components/boxs/chart/ApexChartComponent.jsx` | Add Ukrainian chart locale (month/day names), same pattern as German |

No change needed for documentation links: `DeviceConfigurationLink.jsx`
already falls back to English for languages outside `['en', 'fr']`.

## Server changes

| File | Change |
|------|--------|
| `server/utils/constants.js` | Add `UK: 'uk'` to `AVAILABLE_LANGUAGES` |
| `server/lib/scene/scene.checkCalendarTriggers.js` | `require('dayjs/locale/uk')` |
| `server/lib/scene/scene.checkCalendarTriggers.test.js` | Cover `uk` locale, matching German precedent |
| `server/api/controllers/user.controller.js` | Update `language` apiParam doc to `"en", "fr", "de", "uk"` |
| `server/config/brain/index.js` | Add `'uk'` to `SUPPORTED_LANGUAGES` |
| `server/config/brain/*/answers.uk.json` | New: Ukrainian reply templates for every brain domain (backup, battery-threshold, calendar, camera, humidity-sensor, light, openai, scene, switch, user, …) |

Brain note: `brain.getReply` throws `NotFoundError` when a
`language:intent` pair is missing, so every domain folder that has
`answers.en.json` must get a complete `answers.uk.json`.

## Error handling

- Missing translation keys: impossible to ship — CI key-parity check fails the build.
- Unsupported docs language: existing fallback to English covers `uk`.
- Brain replies: full coverage of all domains avoids `NotFoundError` at runtime.

## Verification

1. `npm run compare-translations` in `front/` — key parity across all four files.
2. Front lint/prettier per repo config.
3. Server tests: calendar triggers (`scene.checkCalendarTriggers.test.js`) and
   brain loading.
4. Manual spot-check of the running UI in Ukrainian (profile → language → Українська).

## Out of scope

- Upstream contribution to GladysAssistant/Gladys (may be proposed later).
- Translating gladysassistant.com documentation.
- Voice/NLP intent recognition in Ukrainian (separate concern from reply templates).
