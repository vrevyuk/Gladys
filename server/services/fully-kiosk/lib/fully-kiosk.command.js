const { getDeviceParam } = require('../../../utils/device');
const { DEVICE_PARAM_NAME, DEFAULT_PORT, FULLY_COMMANDS } = require('./fully-kiosk.constants');

/**
 * @description Build the Fully Kiosk Remote Admin REST URL for a command.
 * @param {object} device - The Gladys device (tablet).
 * @param {string} cmd - Fully command name.
 * @param {object} extraParams - Extra query params to append.
 * @returns {string} The full request URL.
 * @example
 * buildCommandUrl(device, 'screenOn');
 */
function buildCommandUrl(device, cmd, extraParams = {}) {
  const ip = getDeviceParam(device, DEVICE_PARAM_NAME.IP_ADDRESS) || device.external_id.split(':')[1];
  const port = getDeviceParam(device, DEVICE_PARAM_NAME.PORT) || DEFAULT_PORT;
  const password = getDeviceParam(device, DEVICE_PARAM_NAME.PASSWORD) || '';
  const url = new URL(`http://${ip}:${port}/`);
  url.searchParams.set('cmd', cmd);
  url.searchParams.set('password', password);
  url.searchParams.set('type', 'json');
  Object.keys(extraParams).forEach((key) => {
    url.searchParams.set(key, extraParams[key]);
  });
  // URL encodes spaces as %20 in the query — matches Fully's expectations.
  return url.toString();
}

/**
 * @description Send a command to a tablet over its Remote Admin REST API.
 * @param {object} device - The Gladys device (tablet).
 * @param {string} cmd - Fully command name.
 * @param {object} extraParams - Extra query params to append.
 * @returns {Promise} The axios response.
 * @example
 * await handler.sendCommand(device, 'screenOn');
 */
async function sendCommand(device, cmd, extraParams = {}) {
  const url = buildCommandUrl(device, cmd, extraParams);
  return this.axios.get(url);
}

/**
 * @description Fetch and return the parsed deviceInfo JSON from a tablet.
 * @param {object} device - The Gladys device (tablet).
 * @returns {Promise<object>} The parsed deviceInfo object.
 * @example
 * const info = await handler.getDeviceInfo(device);
 */
async function getDeviceInfo(device) {
  const response = await this.sendCommand(device, FULLY_COMMANDS.DEVICE_INFO);
  return response.data;
}

module.exports = {
  buildCommandUrl,
  sendCommand,
  getDeviceInfo,
};
