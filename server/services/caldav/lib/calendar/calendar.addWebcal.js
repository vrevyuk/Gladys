const logger = require('../../../../utils/logger');
const { BadParameters } = require('../../../../utils/coreErrors');

const DEFAULT_CALENDAR_COLOR = '#3174ad';
const DEFAULT_CALENDAR_NAME = 'Proton Calendar';

/**
 * @description Subscribe to a public ICS/Webcal URL (e.g. A Proton Calendar share link).
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
  const calNameMatch = icalData.match(/X-WR-CALNAME[^:]*:(.+)/);
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
