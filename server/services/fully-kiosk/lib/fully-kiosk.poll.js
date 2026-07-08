const logger = require('../../../utils/logger');
const { EVENTS } = require('../../../utils/constants');

/**
 * @description Read a boolean from deviceInfo supporting two key spellings.
 * @param {object} info - The deviceInfo object.
 * @param {string} keyA - Primary key name.
 * @param {string} keyB - Fallback key name.
 * @returns {boolean|undefined} The boolean value or undefined if absent.
 * @example
 * readBool(info, 'isScreenOn', 'screenOn');
 */
function readBool(info, keyA, keyB) {
  if (info[keyA] !== undefined) {
    return Boolean(info[keyA]);
  }
  if (info[keyB] !== undefined) {
    return Boolean(info[keyB]);
  }
  return undefined;
}

/**
 * @description Poll a tablet's state and emit new feature states.
 * @param {object} device - The Gladys device (tablet).
 * @returns {Promise} Resolves once state has been emitted (or on handled error).
 * @example
 * await handler.poll(device);
 */
async function poll(device) {
  let info;
  try {
    info = await this.getDeviceInfo(device);
  } catch (e) {
    logger.warn(`Fully Kiosk: unable to poll device ${device.external_id}`);
    logger.debug(e);
    return;
  }

  const [prefix, ip] = device.external_id.split(':');
  const base = `${prefix}:${ip}`;
  const emit = (command, state) => {
    this.gladys.event.emit(EVENTS.DEVICE.NEW_STATE, {
      device_feature_external_id: `${base}:${command}`,
      state,
    });
  };

  const screenOn = readBool(info, 'isScreenOn', 'screenOn');
  if (screenOn !== undefined) {
    emit('screen', screenOn ? 1 : 0);
  }
  if (info.screenBrightness !== undefined) {
    emit('brightness', parseInt(info.screenBrightness, 10));
  }
  if (info.batteryLevel !== undefined) {
    emit('battery', parseInt(info.batteryLevel, 10));
  }
  const plugged = readBool(info, 'isPlugged', 'plugged');
  if (plugged !== undefined) {
    emit('charging', plugged ? 1 : 0);
  }
}

module.exports = {
  poll,
};
