const logger = require('../../../../utils/logger');
const { NotFoundError } = require('../../../../utils/coreErrors');

/**
 * @description Delete a calendar and all its events, if it belongs to the user.
 * @param {string} userId - Id of the user requesting the deletion.
 * @param {string} selector - Calendar selector to delete.
 * @returns {Promise} Resolve when the calendar is deleted.
 * @example
 * destroyCalendar('user-id', 'my-proton-calendar');
 */
async function destroyCalendar(userId, selector) {
  const calendars = await this.gladys.calendar.get(userId, { selector });
  const owned = calendars.find((calendar) => calendar.user_id === userId);
  if (!owned) {
    throw new NotFoundError('CALENDAR_NOT_FOUND');
  }
  await this.gladys.calendar.destroy(selector);
  logger.info(`Calendar ${selector} deleted`);
}

module.exports = {
  destroyCalendar,
};
