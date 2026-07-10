const logger = require('../../../utils/logger');
const { FULLY_COMMANDS } = require('./fully-kiosk.constants');

/**
 * @description Ask every configured tablet to reload its start URL.
 * Used after a Gladys boot so tablets pick up the new front-end.
 * @returns {Promise} Resolves once every tablet has been contacted.
 * @example
 * await handler.reloadAll();
 */
async function reloadAll() {
  const devices = await this.gladys.device.get({ service: 'fully-kiosk' });
  if (devices.length === 0) {
    logger.debug('Fully Kiosk: no tablet configured, nothing to reload');
    return;
  }
  logger.info(`Fully Kiosk: asking ${devices.length} tablet(s) to reload their start URL`);
  await Promise.all(
    devices.map(async (device) => {
      try {
        await this.sendCommand(device, FULLY_COMMANDS.LOAD_START_URL);
      } catch (e) {
        logger.warn(`Fully Kiosk: unable to reload device ${device.external_id}`);
        logger.debug(e);
      }
    }),
  );
}

module.exports = {
  reloadAll,
};
