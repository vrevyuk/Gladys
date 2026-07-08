const { BadParameters } = require('../../../utils/coreErrors');
const { EXTERNAL_ID_PREFIX, FULLY_COMMANDS } = require('./fully-kiosk.constants');

/**
 * @description Send a new value to a tablet feature over the Remote Admin REST API.
 * @param {object} device - The Gladys device (tablet).
 * @param {object} deviceFeature - The feature being written.
 * @param {string|number} value - The new value.
 * @returns {Promise} Resolves when the command was sent.
 * @example
 * await handler.setValue(device, deviceFeature, 1);
 */
async function setValue(device, deviceFeature, value) {
  const externalId = deviceFeature.external_id;
  const [prefix, , command] = externalId.split(':');
  if (prefix !== EXTERNAL_ID_PREFIX) {
    throw new BadParameters(`Fully Kiosk external_id is invalid: "${externalId}" should start with "${EXTERNAL_ID_PREFIX}:"`);
  }

  switch (command) {
    case 'screen':
      return this.sendCommand(device, value ? FULLY_COMMANDS.SCREEN_ON : FULLY_COMMANDS.SCREEN_OFF);
    case 'brightness':
      return this.sendCommand(device, FULLY_COMMANDS.SET_STRING_SETTING, { key: 'screenBrightness', value });
    case 'load-url':
      return this.sendCommand(device, FULLY_COMMANDS.LOAD_URL, { url: value });
    case 'tts':
      return this.sendCommand(device, FULLY_COMMANDS.TEXT_TO_SPEECH, { text: value });
    default:
      throw new BadParameters(`Fully Kiosk external_id is not managed: "${externalId}"`);
  }
}

module.exports = {
  setValue,
};
