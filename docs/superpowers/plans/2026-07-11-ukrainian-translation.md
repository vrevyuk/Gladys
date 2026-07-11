# Ukrainian Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ukrainian (`uk`) as a fully supported UI language in Gladys, including server-side chat brain replies.

**Architecture:** Mirror the German localization precedent (upstream PR #1998). `uk.json` is seeded as an exact copy of `en.json` (guaranteeing CI key parity from the first commit), then translated in place, section by section, across 13 chunk tasks. Wiring (language registration, dayjs locales, chart locales, brain answers) is done first so the language is selectable immediately.

**Tech Stack:** Preact + preact-i18n (front), dayjs, apexcharts, Node/Express (server), mocha/chai (server tests), `comparejson` CI key-parity check.

**Spec:** `docs/superpowers/specs/2026-07-11-ukrainian-translation-design.md`

## Global Constraints

Every task implicitly includes these rules:

- **Branch:** work on `vitalii/ukrainian-translation`; final PR targets `vitalii/develop`.
- **Tone:** formal «ви» (Ви можете…, Введіть…, Ваш пристрій…). Imperatives for buttons/labels (Зберегти, Видалити, Налаштувати).
- **Key parity:** `uk.json` must always contain exactly the same keys as `en.json`. CI enforces this via `cd front && npm run compare-translations`. Never add/remove/rename a key in only one file.
- **Placeholders:** preserve `{{var}}` tokens (including inner spacing, e.g. `{{ event.name }}`) and `%token%` tokens byte-for-byte. Preserve embedded HTML tags (`<b>`, `<a href=...>`, `<br/>`, `<i>`, `<kbd>`) and markdown untouched, translating only the human text around them.
- **Do not translate:** brand/product/protocol names (Gladys, Gladys Plus, Zigbee2MQTT, MQTT, Z-Wave, Matter, Tuya, Netatmo, Philips Hue, Sonos, Node-RED, Tasmota, Broadlink, eWeLink, MELCloud, CalDAV, Bluetooth, HomeKit, AirPlay, Telegram, Nextcloud, OpenAI, Enedis, Home Assistant, Fully Kiosk, API, URL, ID, MQTT topics, JSON, Wi-Fi, IP, DNS, SSL). Technical values like units (`kWh`, `°C`) stay as-is.
- **Language names stay in their own language in every file:** `"english": "English"`, `"french": "Français"`, `"german": "Deutsch"`, `"ukrainian": "Українська"` — never translate these values.
- **Glossary (use consistently in every chunk):**
  - device → пристрій; feature → функція; room → кімната; house → будинок
  - dashboard → панель приладів; box (dashboard box) → блок
  - scene → сцена; trigger → тригер; action → дія; condition → умова
  - integration → інтеграція; service → сервіс; settings → налаштування
  - user → користувач; sign in/login → вхід / увійти; sign up → реєстрація
  - backup → резервна копія; gateway → шлюз; sensor → датчик
  - switch (device) → вимикач; light → світло/лампа; camera → камера
  - battery → батарея; temperature → температура; humidity → вологість
  - calendar → календар; event → подія; job → завдання; alarm → сигналізація
- **Formatting:** after editing any `front/src/config/i18n/*.json`, run `cd front && npx prettier --write src/config/i18n/*.json` before committing (CI runs `prettier-check` over JSON).
- **Commits:** conventional commits style used by this repo, e.g. `feat(i18n): …`, `feat(brain): …`.
- **Working directory:** repo root is `/home/vitalii/Documents/myprojects/Gladys`. `npm` commands run inside `front/` or `server/` as stated.
- **Translation authoring:** the implementer (Claude, fluent in Ukrainian) writes the Ukrainian prose at execution time following these rules; the plan defines exact scope + validation per task instead of embedding ~200KB of prose.

---

### Task 1: Register `uk` language and seed `uk.json`

**Files:**
- Modify: `server/utils/constants.js:248-252` (`AVAILABLE_LANGUAGES`)
- Modify: `front/src/config/i18n/en.json`, `front/src/config/i18n/fr.json`, `front/src/config/i18n/de.json` (add `ukrainian` label keys)
- Create: `front/src/config/i18n/uk.json` (seeded copy of `en.json`)
- Modify: `front/src/config/i18n/index.js`
- Modify: `front/src/index.js:2-4` (dayjs locale import)
- Modify: `front/src/components/user/profile.jsx:141-144` (language `<option>`)

**Interfaces:**
- Produces: `AVAILABLE_LANGUAGES.UK === 'uk'` (server + front both import this constant); `front/src/config/i18n/uk.json` with full `en.json` key set — all later chunk tasks edit this file in place.
- Note: signup reuses the `Profile` component and `getDefaultState()` already derives browser-language from `AVAILABLE_LANGUAGES_LIST`, so no signup-route change is needed.

- [ ] **Step 1: Add `UK` to `AVAILABLE_LANGUAGES` in `server/utils/constants.js`**

```js
const AVAILABLE_LANGUAGES = {
  EN: 'en',
  FR: 'fr',
  DE: 'de',
  UK: 'uk',
};
```

- [ ] **Step 2: Add the `ukrainian` label key to en/fr/de JSON files**

In each of `front/src/config/i18n/en.json`, `fr.json`, `de.json`, add `"ukrainian": "Українська",` immediately after the existing `"german": "Deutsch",` line in BOTH places it appears:
1. inside `signup.createLocalAccount` (near the top, after `"german"`)
2. inside `profile` (after `"german"`)

Example (en.json, `profile` section):

```json
    "english": "English",
    "french": "Français",
    "german": "Deutsch",
    "ukrainian": "Українська",
```

- [ ] **Step 3: Seed `uk.json` as an exact copy of the updated `en.json`**

```bash
cp front/src/config/i18n/en.json front/src/config/i18n/uk.json
```

- [ ] **Step 4: Register `uk` in `front/src/config/i18n/index.js`**

Replace the whole file with:

```js
import en from './en.json';
import fr from './fr.json';
import de from './de.json';
import uk from './uk.json';
import { AVAILABLE_LANGUAGES } from '../../../../server/utils/constants';

export default {
  [AVAILABLE_LANGUAGES.FR]: fr,
  [AVAILABLE_LANGUAGES.EN]: en,
  [AVAILABLE_LANGUAGES.DE]: de,
  [AVAILABLE_LANGUAGES.UK]: uk
};
```

(If prettier reflows this, accept prettier's formatting.)

- [ ] **Step 5: Import the dayjs locale in `front/src/index.js`**

After `import 'dayjs/locale/de';` add:

```js
import 'dayjs/locale/uk';
```

- [ ] **Step 6: Add the Ukrainian option in `front/src/components/user/profile.jsx`**

After the `de` option (lines 141–143), add:

```jsx
          <option value="uk">
            <Text id="profile.ukrainian" />
          </option>
```

- [ ] **Step 7: Verify key parity and formatting**

```bash
cd front && npx prettier --write src/config/i18n/*.json && npm run compare-translations
```

Expected: `comparejson` exits 0, `check_translations.js` prints nothing and exits 0.

- [ ] **Step 8: Verify lint on touched front files**

```bash
cd front && npx eslint src/config/i18n/index.js src/index.js src/components/user/profile.jsx src/config/i18n/uk.json
```

Expected: exit 0, no errors.

- [ ] **Step 9: Commit**

```bash
git add server/utils/constants.js front/src/config/i18n front/src/index.js front/src/components/user/profile.jsx
git commit -m "feat(i18n): register Ukrainian language and seed uk.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Placeholder-parity checker script

**Files:**
- Create: `front/cli/check_i18n_placeholders.js`

**Interfaces:**
- Produces: `node ./cli/check_i18n_placeholders.js <lang>` (run from `front/`) — exits 1 listing every key whose `{{…}}`/`%…%` token multiset differs from `en.json`, exits 0 when clean. All chunk tasks (6–18) run this.

- [ ] **Step 1: Write the script**

```js
/**
 * Compares {{var}} and %token% placeholders between en.json and another
 * translation file. Usage: node ./cli/check_i18n_placeholders.js uk
 */
const en = require('../src/config/i18n/en.json');

const lang = process.argv[2];
if (!lang) {
  console.error('Usage: node ./cli/check_i18n_placeholders.js <lang>');
  process.exit(2);
}
// eslint-disable-next-line import/no-dynamic-require
const other = require(`../src/config/i18n/${lang}.json`);

const PLACEHOLDER_REGEX = /{{[^}]+}}|%[a-zA-Z_]+%/g;

const getTokens = str => (str.match(PLACEHOLDER_REGEX) || []).sort().join('|');

const errors = [];

const walk = (enNode, otherNode, path) => {
  if (typeof enNode === 'string') {
    if (typeof otherNode !== 'string') {
      errors.push(`${path}: missing or not a string in ${lang}.json`);
    } else if (getTokens(enNode) !== getTokens(otherNode)) {
      errors.push(`${path}: placeholders differ\n  en: ${enNode}\n  ${lang}: ${otherNode}`);
    }
    return;
  }
  Object.keys(enNode).forEach(key => {
    walk(enNode[key], otherNode ? otherNode[key] : undefined, path ? `${path}.${key}` : key);
  });
};

walk(en, other, '');

if (errors.length > 0) {
  console.error(`${errors.length} placeholder mismatches:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`${lang}.json placeholders OK`);
```

- [ ] **Step 2: Verify it passes on the seeded (identical) uk.json**

```bash
cd front && node ./cli/check_i18n_placeholders.js uk
```

Expected: `uk.json placeholders OK`, exit 0.

- [ ] **Step 3: Verify it actually detects a mismatch (manual test)**

```bash
cd front && python3 - <<'EOF'
import json
p = 'src/config/i18n/uk.json'
d = json.load(open(p))
orig = d['chat']
d['chat'] = json.loads(json.dumps(orig).replace('{{', 'X{{', 1))
json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
EOF
node ./cli/check_i18n_placeholders.js uk; echo "exit=$?"
git checkout -- src/config/i18n/uk.json
node ./cli/check_i18n_placeholders.js uk
```

Expected: first run reports 1 mismatch with `exit=1`; after `git checkout`, second run passes.

- [ ] **Step 4: Lint and commit**

```bash
cd front && npx eslint cli/check_i18n_placeholders.js
git add cli/check_i18n_placeholders.js
git commit -m "feat(i18n): add placeholder parity checker for translation files

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Ukrainian chart locale (ApexCharts)

**Files:**
- Modify: `front/src/components/boxs/chart/ApexChartComponent.jsx:4-6` (imports) and all 5 occurrences of `locales: [fr, en, de]`

**Interfaces:**
- Consumes: `props.user.language === 'uk'` (set via Task 1).
- Note: apexcharts ships the Ukrainian locale as `ua.json` with `"name": "ua"`, but Gladys passes `defaultLocale: this.props.user.language` (`'uk'`). The locale object must therefore be renamed to `'uk'` or charts will crash for Ukrainian users.

- [ ] **Step 1: Import and rename the locale**

After `import de from 'apexcharts/dist/locales/de.json';` add:

```js
import uaLocale from 'apexcharts/dist/locales/ua.json';
```

And after the import block (below `import mergeArray …` is fine, keep import group intact):

```js
// apexcharts ships Ukrainian as "ua"; Gladys user language is "uk"
const uk = { ...uaLocale, name: 'uk' };
```

- [ ] **Step 2: Register the locale in all 5 option builders**

Replace every occurrence (5 total) of:

```js
      locales: [fr, en, de],
```

with:

```js
      locales: [fr, en, de, uk],
```

- [ ] **Step 3: Verify lint**

```bash
cd front && npx eslint src/components/boxs/chart/ApexChartComponent.jsx
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add front/src/components/boxs/chart/ApexChartComponent.jsx
git commit -m "feat(i18n): add Ukrainian locale to dashboard charts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Server dayjs locale + API doc

**Files:**
- Modify: `server/lib/scene/scene.checkCalendarTriggers.js:5-7`
- Modify: `server/test/lib/scene/scene.checkCalendarTriggers.test.js:5-7`
- Modify: `server/api/controllers/user.controller.js:18`

**Interfaces:**
- Consumes: `AVAILABLE_LANGUAGES.UK` from Task 1 (calendar trigger formats event dates with `.locale(creator.language)`).

- [ ] **Step 1: Require the dayjs locale in the calendar trigger module and its test**

In both `server/lib/scene/scene.checkCalendarTriggers.js` and `server/test/lib/scene/scene.checkCalendarTriggers.test.js`, after `require('dayjs/locale/de');` add:

```js
require('dayjs/locale/uk');
```

- [ ] **Step 2: Update the apiParam doc in `server/api/controllers/user.controller.js`**

```js
   * @apiParam {string="en", "fr", "de", "uk"} language Language of the user
```

- [ ] **Step 3: Run the calendar trigger tests**

```bash
cd server && NODE_ENV=test SQLITE_FILE_PATH=./gladys-test.db npx mocha --require ./test/setup-env.js ./test/bootstrap.test.js ./test/lib/scene/scene.checkCalendarTriggers.test.js --exit
```

Expected: all tests pass.

- [ ] **Step 4: Lint and commit**

```bash
cd server && npx eslint lib/scene/scene.checkCalendarTriggers.js api/controllers/user.controller.js test/lib/scene/scene.checkCalendarTriggers.test.js
git add server/lib/scene/scene.checkCalendarTriggers.js server/test/lib/scene/scene.checkCalendarTriggers.test.js server/api/controllers/user.controller.js
git commit -m "feat(server): support Ukrainian dates in calendar triggers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Ukrainian brain reply templates

**Files:**
- Modify: `server/config/brain/index.js:4` (`SUPPORTED_LANGUAGES`)
- Create: `server/config/brain/<domain>/answers.uk.json` for all 13 domains: `backup`, `battery-threshold`, `calendar`, `camera`, `humidity-sensor`, `light`, `openai`, `scene`, `switch`, `system`, `temperature-sensor`, `user`, `weather`
- Modify: `server/test/lib/brain/brain.test.js`

**Interfaces:**
- Consumes: nothing from other tasks (independent of front-end).
- Produces: `brain.getReply('uk', <intent>, context)` works for every intent that works in `'en'`.

- [ ] **Step 1: Add a failing test for Ukrainian replies**

In `server/test/lib/brain/brain.test.js`, after the existing `should getReply` test, add:

```js
  it('should getReply in Ukrainian', async () => {
    await brain.load();
    const reply = brain.getReply('uk', 'calendar.next-event.get-location.success', {
      event: {
        location: 'Париж',
        name: 'робота',
      },
    });
    expect(reply).to.be.a('string');
    expect(reply.length).to.be.greaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd server && NODE_ENV=test SQLITE_FILE_PATH=./gladys-test.db npx mocha --require ./test/setup-env.js ./test/bootstrap.test.js ./test/lib/brain/brain.test.js --exit
```

Expected: FAIL — `NotFoundError: Answer with intent calendar.next-event.get-location.success and language uk not found`.

- [ ] **Step 3: Add `'uk'` to `SUPPORTED_LANGUAGES` in `server/config/brain/index.js`**

```js
const SUPPORTED_LANGUAGES = ['en', 'fr', 'uk'];
```

- [ ] **Step 4: Create `answers.uk.json` in each of the 13 domain folders**

For every folder, copy the structure of its `answers.en.json` exactly — same array order, same `label` values untouched — and translate ONLY the strings inside each `answers` array (formal «ви», Handlebars `{{ … }}` placeholders preserved byte-for-byte). Style reference — `server/config/brain/light/answers.uk.json`:

```json
[
  {
    "label": "light.turn-on.success",
    "answers": ["Я увімкнув світло."]
  },
  {
    "label": "light.turn-on.fail",
    "answers": ["Мені не вдалося увімкнути світло."]
  },
  {
    "label": "light.turn-off.success",
    "answers": ["Я вимкнув світло."]
  },
  {
    "label": "light.turn-off.fail",
    "answers": ["Мені не вдалося вимкнути світло."]
  },
  {
    "label": "light.not-found",
    "answers": ["Я не знайшов жодного світла в цій кімнаті."]
  }
]
```

And `server/config/brain/calendar/answers.uk.json`:

```json
[
  {
    "label": "calendar.next-event.get-location.success",
    "answers": ["Ваша наступна подія — {{ event.name }}, місце проведення: {{ event.location }}"]
  },
  {
    "label": "calendar.next-event.get-location.fail",
    "answers": ["Мені не вдалося отримати вашу наступну подію."]
  }
]
```

Remaining 11 files: translate at execution time following the same pattern (weather is the largest at ~245 lines; keep `{{ … }}` tokens and unit strings intact).

- [ ] **Step 5: Verify label parity and placeholder parity for all domains**

```bash
cd server && python3 - <<'EOF'
import json, glob, re, sys
tok = lambda s: sorted(re.findall(r'{{[^}]+}}', s))
bad = []
for en_path in glob.glob('config/brain/*/answers.en.json'):
    uk_path = en_path.replace('answers.en', 'answers.uk')
    en = json.load(open(en_path)); uk = json.load(open(uk_path))
    if [e['label'] for e in en] != [u['label'] for u in uk]:
        bad.append(f'{uk_path}: label list differs'); continue
    for e, u in zip(en, uk):
        for ea, ua in zip(e['answers'], u['answers']):
            if tok(ea) != tok(ua):
                bad.append(f"{uk_path} [{e['label']}]: placeholders differ")
        if len(e['answers']) != len(u['answers']):
            bad.append(f"{uk_path} [{e['label']}]: answers count differs")
print('\n'.join(bad) if bad else 'brain uk answers OK')
sys.exit(1 if bad else 0)
EOF
```

Expected: `brain uk answers OK`.

- [ ] **Step 6: Run the brain tests to verify they pass**

```bash
cd server && NODE_ENV=test SQLITE_FILE_PATH=./gladys-test.db npx mocha --require ./test/setup-env.js ./test/bootstrap.test.js ./test/lib/brain/brain.test.js --exit
```

Expected: PASS, including `should getReply in Ukrainian`.

- [ ] **Step 7: Prettier + commit**

```bash
cd server && npx prettier --write 'config/brain/**/*.json' config/brain/index.js && npx eslint config/brain/index.js
git add server/config/brain server/test/lib/brain/brain.test.js
git commit -m "feat(brain): add Ukrainian reply templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tasks 6–18: Translate `uk.json` in place, chunk by chunk

Tasks 6–18 share identical mechanics and differ only in which top-level sections of `front/src/config/i18n/uk.json` they translate. Each task:

**Files:**
- Modify: `front/src/config/i18n/uk.json` (ONLY the values inside the sections listed for that task — never keys, never other sections)

**Interfaces:**
- Consumes: seeded `uk.json` (Task 1), checker script (Task 2).
- Produces: listed sections fully translated to Ukrainian.

**Steps for every chunk task:**

- [ ] **Step 1: Translate the listed sections** — edit `front/src/config/i18n/uk.json` in place, replacing English values with Ukrainian per Global Constraints (tone, glossary, placeholders, brand names, language names untouched).

- [ ] **Step 2: Verify**

```bash
cd front && npx prettier --write src/config/i18n/uk.json && npm run compare-translations && node ./cli/check_i18n_placeholders.js uk
```

Expected: all three commands exit 0, checker prints `uk.json placeholders OK`.

- [ ] **Step 3: Spot-check for accidentally skipped strings** — run:

```bash
cd front && python3 - <<'EOF'
import json, sys
SECTIONS = sys.argv[1:] if len(sys.argv) > 1 else []
en = json.load(open('src/config/i18n/en.json'))
uk = json.load(open('src/config/i18n/uk.json'))
def walk(e, u, p):
    if isinstance(e, str):
        if e == u and len(e) > 3 and any(c.isalpha() for c in e):
            print(p, '==', e[:60])
        return
    for k in e: walk(e[k], u[k], f'{p}.{k}')
for s in SECTIONS: walk(en[s], uk[s], s)
EOF
```

(passing that task's section names as arguments). Review the output: every printed line must be an INTENTIONAL identical value (brand name, "OK", "URL", "Token", language names). Translate anything that slipped through.

- [ ] **Step 4: Commit**

```bash
git add front/src/config/i18n/uk.json
git commit -m "feat(i18n): translate <sections> to Ukrainian

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Chunk assignments** (top-level keys of `en.json`, in file order; sizes are JSON bytes to translate):

| Task | Sections | ~Size |
|------|----------|-------|
| 6 | `global`, `color`, `calendar`, `device`, `login`, `locked`, `signup` | 9.4 KB |
| 7 | `dashboard`, `newDashboard` | 14.7 KB |
| 8 | `integration` → sub-keys `tags`, `root`, `telegram`, `nextcloudTalk`, `free-mobile`, `philipsHue`, `rtspCamera`, `netatmo`, `tasmota`, `fully-kiosk`, `tpLink` | 17.1 KB |
| 9 | `integration` → `zigbee2mqtt`, `nodeRed`, `matterbridge`, `googleHome`, `alexa`, `enedis`, `homekit`, `owntracks`, `openWeather` | 18.6 KB |
| 10 | `integration` → `tuya`, `sonos`, `google-cast`, `airplay`, `zwavejs-ui`, `melcloud` | 19.0 KB |
| 11 | `integration` → `mqtt`, `broadlink`, `lanManager`, `xiaomi` | 18.1 KB |
| 12 | `integration` → `energyMonitoring`, `caldav`, `bluetooth`, `eWeLink`, `nuki`, `openai` | 21.1 KB |
| 13 | `integration` → `callmebot`, `matter`, `mcp` | 7.6 KB |
| 14 | `editScene` | 16.9 KB |
| 15 | `profile`, `settings`, `housesSettings`, `usersSettings`, `sessionsSettings`, `servicesSettings`, `forgotPassword`, `resetPassword`, `httpErrors`, `jobsSettings`, `systemSettings`, `newArea`, `newScene`, `duplicateScene`, `scene`, `gateway` | 17.1 KB |
| 16 | `gatewayPricing`, `gladysPlusUpsell`, `gatewayLogin`, `gatewayBackup`, `alarmModes`, `deviceFeatureUnit`, `deviceFeatureUnitShort`, `deviceFeatureAction` | 17.1 KB |
| 17 | `deviceFeatureValue`, `deviceFeatureCategory` | 18.4 KB |
| 18 | `errorPage`, `chat`, `history`, `header`, `gatewayLinkUser`, `editDeviceForm`, `gatewaySignup`, `gatewaySubscribe`, `gatewayForgotPassword`, `gatewayResetPassword`, `gatewayOpenApi`, `gatewayTwoFactorAuth`, `gatewaySignUp`, `gatewayUsers`, `gatewayBilling` | 11.2 KB |

For Tasks 8–13 (`integration` sub-keys): the spot-check script takes only top-level section names, so run it with `integration` as the argument and review only lines under the sub-keys assigned to that task. Sub-keys not yet translated will print — that's expected until Task 13 completes.

For the spot-check in Step 3, substitute each task's section list, e.g. Task 6: `python3 - global color calendar device login locked signup <<'EOF' …`.

---

### Task 19: Final verification and PR

**Files:** none (verification only)

- [ ] **Step 1: Full front checks**

```bash
cd front && npm run compare-translations && node ./cli/check_i18n_placeholders.js uk && npm run eslint && npm run prettier-check
```

Expected: all exit 0.

- [ ] **Step 2: Full-file translation completeness sweep**

```bash
cd front && python3 - <<'EOF'
import json
en = json.load(open('src/config/i18n/en.json'))
uk = json.load(open('src/config/i18n/uk.json'))
identical = []
def walk(e, u, p):
    if isinstance(e, str):
        if e == u and len(e) > 3 and any(c.isalpha() for c in e):
            identical.append(f'{p} == {e[:60]}')
        return
    for k in e: walk(e[k], u[k], f'{p}.{k}')
walk(en, uk, '')
print(f'{len(identical)} identical values (review each):')
print('\n'.join(identical))
EOF
```

Review every line — each must be intentionally identical (brand names, protocol names, language names, units). Fix stragglers, re-run.

- [ ] **Step 3: Server checks**

```bash
cd server && npx eslint . && NODE_ENV=test SQLITE_FILE_PATH=./gladys-test.db npx mocha --require ./test/setup-env.js ./test/bootstrap.test.js ./test/lib/brain/brain.test.js ./test/lib/scene/scene.checkCalendarTriggers.test.js --exit
```

Expected: lint clean, all tests pass.

- [ ] **Step 4: Manual smoke test (run the app)**

```bash
# terminal 1
cd server && npm start
# terminal 2
cd front && npm run dev
```

Open http://localhost:1444, go to Profile → Language → Українська, save; verify dashboard, settings, and an integration page render in Ukrainian with no `missing translation` artifacts or raw keys.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin vitalii/ukrainian-translation
gh pr create --base vitalii/develop --title "feat(i18n): add Ukrainian translation" --body "$(cat <<'EOF'
## Що зроблено

- Повний переклад інтерфейсу Gladys українською (uk.json, ~5000 рядків, формальне «ви»)
- Реєстрація мови `uk` (константи сервера, i18n фронтенду, dayjs, ApexCharts)
- Українські відповіді чат-мозку (13 доменів answers.uk.json)
- Скрипт перевірки плейсхолдерів `front/cli/check_i18n_placeholders.js`

## Тестування

- `npm run compare-translations` — паритет ключів у 4 файлах
- `node ./cli/check_i18n_placeholders.js uk` — паритет плейсхолдерів
- Тести сервера: brain, calendar triggers
- Ручна перевірка UI українською

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** constants ✔ (T1), i18n index ✔ (T1), dayjs front ✔ (T1), profile option + labels ✔ (T1), signup ✔ (no change needed — reuses Profile + getDefaultState; verified in code), ApexCharts ✔ (T3, with the `ua`→`uk` name fix the spec missed), calendar triggers + test ✔ (T4), apiParam ✔ (T4), brain ✔ (T5), full translation ✔ (T6–18), verification ✔ (T2, T19).
- **Deviation from spec:** spec listed a signup-route change; investigation showed `getDefaultState()` already handles browser-language detection generically, so no change is needed there.
- **Deviation from plan norms:** Ukrainian prose for uk.json chunks and 11 of 13 brain files is authored at execution time (embedding ~200KB of translation in the plan is impractical); scope, rules, glossary, and mechanical validation per task substitute for embedded content.
