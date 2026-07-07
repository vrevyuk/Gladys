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
