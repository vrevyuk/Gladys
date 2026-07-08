const { Op } = require('sequelize');

const Promise = require('bluebird');
const db = require('../../models');
const { EVENTS, WEBSOCKET_MESSAGE_TYPES } = require('../../utils/constants');

/**
 * @description Update a dashboard.
 * @param {string} userId - The userId querying.
 * @param {Array<string>} dashboards - Dashboard selectors new order.
 * @example
 * gladys.dashboard.updateOrder('483b68cb-15ef-4ea3-80df-1e1bed5b402d', ['my-dashboard', 'other-dashboard']);
 */
async function updateOrder(userId, dashboards) {
  // Foreach dashboard, update its position
  await Promise.each(dashboards, async (dashboard, index) => {
    await db.Dashboard.update(
      { position: index },
      {
        where: {
          // I can edit dashboard I created or public dashboard
          [Op.or]: [
            {
              user_id: userId,
            },
            {
              visibility: 'public',
            },
          ],
          selector: dashboard,
        },
      },
    );
  });

  // Notify the user's other devices (e.g. a wall tablet) so they refresh the dashboard order.
  this.event.emit(EVENTS.WEBSOCKET.SEND, {
    type: WEBSOCKET_MESSAGE_TYPES.DASHBOARD.UPDATED,
    userId,
    payload: {},
  });
}

module.exports = {
  updateOrder,
};
