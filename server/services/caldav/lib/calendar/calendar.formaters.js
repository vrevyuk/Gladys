// From : https://github.com/peterbraden/ical.js/blob/master/example_rrule.js
/**
 * @description Format recurring events.
 * @param {object} event - Event to format.
 * @param {object} gladysCalendar - Gladys calendar where event is saved.
 * @returns {Array} Formatted event.
 * @example
 * formatRecurringEvents(event, gladysCalendar)
 */
function formatRecurringEvents(event, gladysCalendar) {
  const { tz } = event.start;
  // Local wall-clock time of the event (e.g. "17:30:00"). The ical lib encodes the wall-clock into
  // the instant using the process timezone, so formatting it back here recovers the intended local
  // time regardless of the server timezone.
  const anchorWallClock = this.dayjs(event.start).format('HH:mm:ss');
  let startDate = this.dayjs.tz(this.dayjs(event.start).format('YYYY-MM-DDTHH:mm:ss'), tz);
  let endDate;

  if (event.end) {
    endDate = this.dayjs.tz(this.dayjs(event.end).format('YYYY-MM-DDTHH:mm:ss'), tz);
  } else if (event.duration) {
    endDate = this.dayjs
      .tz(this.dayjs(event.start).format('YYYY-MM-DDTHH:mm:ss'), tz)
      .add(this.dayjs.duration(event.duration));
  } else {
    endDate = this.dayjs.tz(this.dayjs(event.start).format('YYYY-MM-DDTHH:mm:ss'), tz).add(1, 'days');
  }

  // Calculate the duration of the event for use with recurring events.
  const duration = parseInt(endDate.format('x'), 10) - parseInt(startDate.format('x'), 10);

  const rangeStart = this.dayjs().subtract(1, 'years');
  const rangeEnd = this.dayjs().add(2, 'years');

  // For recurring events, get the set of event start dates that fall within the range
  // of dates we're looking for.
  const dates = event.rrule.between(rangeStart.toDate(), rangeEnd.toDate(), true, (date, i) => true);

  // The "dates" array contains the set of dates within our desired date range range that are valid
  // for the recurrence rule.  *However*, it's possible for us to have a specific recurrence that
  // had its date changed from outside the range to inside the range.  One way to handle this is
  // to add *all* recurrence override entries into the set of dates that we check, and then later
  // filter out any recurrences that don't actually belong within our range.
  if (event.recurrences !== undefined) {
    Object.keys(event.recurrences).forEach((r) => {
      // Only add dates that weren't already in the range we added from the rrule so that
      // we don't double-add those events.
      if (this.dayjs(new Date(r)).isBetween(rangeStart, rangeEnd) !== true) {
        dates.push(new Date(r));
      }
    });
  }

  // Diff between start date & first occurrence to handle Timezone issue in rrule lib
  const startDiff = event.rrule.after(startDate.toDate(), true) - startDate.toDate();

  // Loop through the set of date entries to see which recurrences should be printed.
  return dates.map((date, i) => {
    let curEvent = event;
    let showRecurrence = true;
    let curDuration = duration;
    // Rebuild each occurrence from the anchor's local wall-clock time on the occurrence's own date.
    // This preserves the local time across daylight saving time changes (e.g. a 17:30 meeting stays
    // at 17:30 whether the occurrence falls in winter or summer) and does not depend on rrule keeping
    // the UTC offset stable nor on the server timezone.
    startDate = this.dayjs.tz(`${this.dayjs(date).format('YYYY-MM-DD')}T${anchorWallClock}`, tz);

    // Use just the date of the recurrence to look up overrides and exceptions (i.e. chop off time information)
    const dateLookupKey = date.toISOString().substring(0, 10);

    // For each date that we're checking, it's possible that there is a recurrence override for that one day.
    if (curEvent.recurrences !== undefined && curEvent.recurrences[dateLookupKey] !== undefined) {
      // We found an override, so for this recurrence, use a potentially different title,
      // start date, and duration.
      curEvent = curEvent.recurrences[dateLookupKey];
      startDate = this.dayjs.tz(this.dayjs(curEvent.start).format('YYYY-MM-DDTHH:mm:ss'), tz);
      curDuration = parseInt(this.dayjs(curEvent.end).format('x'), 10) - parseInt(startDate.format('x'), 10);
      if (curEvent.status === 'CANCELLED') {
        showRecurrence = false;
      }
    } else if (curEvent.exdate !== undefined && curEvent.exdate[dateLookupKey] !== undefined) {
      // If there's no recurrence override, check for an exception date.
      // Exception dates represent exceptions to the rule.
      // This date is an exception date, which means we should skip it in the recurrence pattern.
      showRecurrence = false;
    }

    // Set the the title and the end date from either the regular event or the recurrence override.
    const recurrenceTitle = curEvent.summary;
    // Advance the tz-aware start by the event duration. Keeping it as a dayjs offset add (rather than
    // reformatting through the process timezone) preserves the correct instant across DST boundaries.
    endDate = startDate.add(curDuration, 'millisecond');

    // If this recurrence ends before the start of the date range, or starts after the end of the date range,
    // don't process it.
    if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
      showRecurrence = false;
    }

    if (showRecurrence === true) {
      const newEvent = {
        external_id: `${event.uid}${startDate.format('YYYY-MM-DD-HH-mm')}`,
        selector: `${event.uid}${startDate.format('YYYY-MM-DD-HH-mm')}`,
        name: recurrenceTitle,
        location: event.location,
        description: event.description,
        url: event.href,
        calendar_id: gladysCalendar.id,
      };

      if (event.start && event.start.tz === undefined) {
        newEvent.full_day = true;
      }

      if (newEvent.full_day) {
        startDate = startDate.subtract(startDiff, 'ms');
        endDate = endDate.subtract(startDiff, 'ms');
      }

      // Serialize with an explicit UTC offset (e.g. +00:00, +03:00) rather than the "Z" shorthand,
      // so the stored value keeps the event's offset consistently across timezones.
      newEvent.start = startDate.format('YYYY-MM-DDTHH:mm:ssZ');
      newEvent.end = endDate.format('YYYY-MM-DDTHH:mm:ssZ');

      return newEvent;
    }

    return null;
  });
}

/**
 * @description Format events for Gladys calendar compatibility.
 * @param {Array} caldavEvents - Events to format.
 * @param {object} gladysCalendar - Gladys calendar where events are saved.
 * @returns {Array} All events formatted.
 * @example
 * formatEvents(caldavEvents, gladysCalendar)
 */
function formatEvents(caldavEvents, gladysCalendar) {
  let events = [];

  caldavEvents.forEach((caldavEvent) => {
    if (caldavEvent.type !== 'VEVENT') {
      return;
    }

    if (typeof caldavEvent.rrule === 'undefined') {
      const newEvent = {
        external_id: caldavEvent.uid,
        selector: caldavEvent.uid,
        name: caldavEvent.summary,
        location: caldavEvent.location,
        description: caldavEvent.description,
        url: caldavEvent.href,
        calendar_id: gladysCalendar.id,
      };

      if (caldavEvent.start) {
        newEvent.start = this.dayjs
          .tz(this.dayjs(caldavEvent.start).format('YYYY-MM-DDTHH:mm:ss'), caldavEvent.start.tz)
          .format('YYYY-MM-DDTHH:mm:ssZ');
      }

      if (caldavEvent.end) {
        newEvent.end = this.dayjs
          .tz(this.dayjs(caldavEvent.end).format('YYYY-MM-DDTHH:mm:ss'), caldavEvent.end.tz)
          .format('YYYY-MM-DDTHH:mm:ssZ');
      } else if (caldavEvent.start && caldavEvent.duration) {
        newEvent.end = this.dayjs
          .tz(this.dayjs(caldavEvent.start).format('YYYY-MM-DDTHH:mm:ss'), caldavEvent.start.tz)
          .add(this.dayjs.duration(caldavEvent.duration))
          .format('YYYY-MM-DDTHH:mm:ssZ');
      }

      if (
        caldavEvent.start &&
        caldavEvent.start.tz === undefined &&
        (Number.isInteger(this.dayjs(caldavEvent.end).diff(this.dayjs(caldavEvent.start), 'days', true)) ||
          (!caldavEvent.end && !caldavEvent.duration))
      ) {
        newEvent.full_day = true;
      }

      if (newEvent.full_day && !caldavEvent.end) {
        newEvent.end = this.dayjs
          .tz(
            this.dayjs(caldavEvent.start)
              .add(1, 'day')
              .format('YYYY-MM-DDTHH:mm:ss'),
            caldavEvent.start.tz,
          )
          .format('YYYY-MM-DDTHH:mm:ssZ');
      }

      events.push(newEvent);
    } else {
      events = events.concat(this.formatRecurringEvents(caldavEvent, gladysCalendar).filter((e) => e !== null));
    }
  });

  return events;
}

/**
 * @description Format calendar for Gladys compatibility.
 * @param {Array} caldavCalendars - Dav calendars to format.
 * @param {object} userId - Gladys user, calendar owner.
 * @returns {Array} Formatted calendars.
 * @example
 * formatCalendars(calendars, userId)
 */
function formatCalendars(caldavCalendars, userId) {
  const calendars = [];
  caldavCalendars.forEach((caldavCalendar) => {
    const newCalendar = {
      external_id: caldavCalendar.url,
      name: caldavCalendar.displayName,
      description: caldavCalendar.description || `Calendar ${caldavCalendar.displayName}`,
      color: caldavCalendar.color || '#3174ad',
      service_id: this.serviceId,
      user_id: userId,
      ctag: caldavCalendar.ctag,
      sync_token: caldavCalendar.syncToken,
      type: caldavCalendar.type,
      sync: caldavCalendar.type === 'CALDAV',
    };

    calendars.push(newCalendar);
  });

  return calendars;
}

module.exports = {
  formatRecurringEvents,
  formatEvents,
  formatCalendars,
};
