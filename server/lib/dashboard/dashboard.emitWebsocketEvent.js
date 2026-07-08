const { EVENTS, DASHBOARD_VISIBILITY } = require('../../utils/constants');

/**
 * @description Notify a user's connected devices that a dashboard changed so they refresh without a manual reload.
 * @param {string} type - The websocket message type to send (WEBSOCKET_MESSAGE_TYPES.DASHBOARD.*).
 * @param {object} dashboard - The dashboard concerned. Must expose user_id, visibility and selector.
 * @example
 * this.emitWebsocketEvent(WEBSOCKET_MESSAGE_TYPES.DASHBOARD.UPDATED, dashboard);
 */
function emitWebsocketEvent(type, dashboard) {
  const payload = {
    selector: dashboard.selector,
  };
  // A public dashboard is visible to every user, so notify all connected sessions.
  if (dashboard.visibility === DASHBOARD_VISIBILITY.PUBLIC) {
    this.event.emit(EVENTS.WEBSOCKET.SEND_ALL, { type, payload });
  } else {
    // A private dashboard only concerns its owner's devices.
    this.event.emit(EVENTS.WEBSOCKET.SEND, { type, userId: dashboard.user_id, payload });
  }
}

module.exports = {
  emitWebsocketEvent,
};
