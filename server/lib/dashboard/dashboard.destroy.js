const { Op } = require('sequelize');
const db = require('../../models');
const { NotFoundError } = require('../../utils/coreErrors');
const { WEBSOCKET_MESSAGE_TYPES } = require('../../utils/constants');

/**
 * @description Delete a dashboard.
 * @param {string} userId - The userId querying.
 * @param {string} selector - The selector.
 * @example
 * gladys.dashboard.destroy('main-dashboard');
 */
async function destroy(userId, selector) {
  const dashboard = await db.Dashboard.findOne({
    where: {
      // I can destroy dashboard I created or public dashboard
      [Op.or]: [
        {
          user_id: userId,
        },
        {
          visibility: 'public',
        },
      ],
      selector,
    },
  });

  if (dashboard === null) {
    throw new NotFoundError('Dashboard not found');
  }

  const destroyedDashboard = dashboard.get({ plain: true });

  await dashboard.destroy();

  // Notify the user's other devices (e.g. a wall tablet) so they refresh the dashboard list.
  this.emitWebsocketEvent(WEBSOCKET_MESSAGE_TYPES.DASHBOARD.DELETED, destroyedDashboard);
}

module.exports = {
  destroy,
};
