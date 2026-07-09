import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

import { timeFormatToken } from '../../../utils/timeFormat';

dayjs.extend(localizedFormat);

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

  const firstTimedIndex = upcoming.findIndex(event => !event.full_day);
  const nextIndex = firstTimedIndex === -1 ? 0 : firstTimedIndex;
  const next = upcoming[nextIndex];
  const rest = upcoming.filter((event, index) => index !== nextIndex);
  const todayEvents = rest.filter(event => dayjs(event.start).isSame(nowD, 'day'));
  const today = todayEvents.slice(0, maxToday);
  const moreCount = todayEvents.length - today.length;

  return { status: 'ok', next, today, moreCount };
}

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
