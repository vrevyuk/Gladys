const { expect } = require('chai');
const sinon = require('sinon');
const dayjs = require('dayjs');
const objectSupport = require('dayjs/plugin/objectSupport');
const duration = require('dayjs/plugin/duration');
const advancedFormat = require('dayjs/plugin/advancedFormat');
const isBetween = require('dayjs/plugin/isBetween');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

const { formatRecurringEvents } = require('../../../../../services/caldav/lib/calendar/calendar.formaters');

dayjs.extend(objectSupport);
dayjs.extend(duration);
dayjs.extend(advancedFormat);
dayjs.extend(isBetween);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * @description Build a weekly recurring event as the `ical` lib produces it when the process
 * runs in UTC: the wall-clock time is encoded straight into the UTC instant, and the intended
 * timezone is attached as `start.tz`. `rrule` then yields occurrences keeping that same UTC clock.
 * @param {string} anchorIso - Anchor instant (wall-clock encoded as UTC).
 * @param {Array} occurrences - Occurrence instants returned by rrule.between.
 * @returns {object} A CalDAV VEVENT-like object.
 * @example
 * kievWeeklyEvent('2026-01-15T17:30:00Z', ['2026-01-15T17:30:00Z']);
 */
function kievWeeklyEvent(anchorIso, occurrences) {
  const start = new Date(anchorIso);
  Object.defineProperty(start, 'tz', { value: 'Europe/Kiev' });
  const end = new Date(dayjs(start).add(1, 'hour').toISOString());
  return {
    uid: 'meeting@test',
    start,
    end,
    summary: 'Meeting',
    location: 'Online',
    description: 'Recurring meeting',
    href: 'https://caldav.host.com/home/meeting',
    rrule: {
      between: sinon.stub().returns(occurrences.map((iso) => new Date(iso))),
      after: sinon.stub().returns(new Date(occurrences[0])),
    },
  };
}

describe('CalDAV formaters - recurring events across DST', () => {
  let formatter;
  let originalTz;
  let clock;

  before(() => {
    // Pin the process timezone so the ical-style wall-clock reconstruction is deterministic,
    // independent of the machine (or CI runner) running the suite.
    originalTz = process.env.TZ;
    process.env.TZ = 'UTC';
    formatter = { dayjs, formatRecurringEvents };
  });

  after(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    // Freeze "now" so rrule.between's [-1y, +2y] range always covers the 2026 occurrences.
    clock = sinon.useFakeTimers(new Date('2026-05-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    clock.restore();
  });

  it('keeps a winter-anchored weekly meeting at the same local time for its summer occurrence', () => {
    // Anchored 15 Jan 2026 17:30 Europe/Kiev (winter, UTC+2). Summer occurrence must stay 17:30 local.
    const event = kievWeeklyEvent('2026-01-15T17:30:00Z', ['2026-01-15T17:30:00Z', '2026-07-09T17:30:00Z']);

    const [winter, summer] = formatter.formatRecurringEvents(event, { id: 'cal-1' });

    expect(dayjs(winter.start).tz('Europe/Kiev').format('HH:mm')).to.equal('17:30');
    expect(dayjs(summer.start).tz('Europe/Kiev').format('HH:mm')).to.equal('17:30');
    expect(dayjs(winter.start).utc().format('HH:mm')).to.equal('15:30');
    expect(dayjs(summer.start).utc().format('HH:mm')).to.equal('14:30');
  });

  it('keeps a summer-anchored weekly meeting at the same local time for its winter occurrence', () => {
    // Anchored 9 Jul 2026 17:30 Europe/Kiev (summer, UTC+3). Winter occurrence must stay 17:30 local.
    const event = kievWeeklyEvent('2026-07-09T17:30:00Z', ['2026-07-09T17:30:00Z', '2026-11-05T17:30:00Z']);

    const [summer, winter] = formatter.formatRecurringEvents(event, { id: 'cal-1' });

    expect(dayjs(summer.start).tz('Europe/Kiev').format('HH:mm')).to.equal('17:30');
    expect(dayjs(winter.start).tz('Europe/Kiev').format('HH:mm')).to.equal('17:30');
    expect(dayjs(summer.start).utc().format('HH:mm')).to.equal('14:30');
    expect(dayjs(winter.start).utc().format('HH:mm')).to.equal('15:30');
  });
});
