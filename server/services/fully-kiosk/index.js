const logger = require('../../utils/logger');
const FullyKioskHandler = require('./lib');
const FullyKioskController = require('./api/fully-kiosk.controller');
const { BOOT_RELOAD_DELAY_MS } = require('./lib/fully-kiosk.constants');

module.exports = function FullyKioskService(gladys, serviceId) {
  const fullyKioskHandler = new FullyKioskHandler(gladys, serviceId);
  let bootReloadTimeout = null;

  /**
   * @public
   * @description Start the Fully Kiosk service.
   * @example
   * gladys.services['fully-kiosk'].start();
   */
  async function start() {
    logger.info('Starting Fully Kiosk service');
    // On boot (e.g. after an upgrade), reload configured tablets so they
    // pick up the new front-end. Delayed because services start before
    // the HTTP server is listening.
    bootReloadTimeout = setTimeout(async () => {
      try {
        await fullyKioskHandler.reloadAll();
      } catch (e) {
        logger.warn('Fully Kiosk: unable to reload tablets on boot');
        logger.debug(e);
      }
    }, BOOT_RELOAD_DELAY_MS);
  }

  /**
   * @public
   * @description Stop the Fully Kiosk service.
   * @example
   * gladys.services['fully-kiosk'].stop();
   */
  async function stop() {
    logger.info('Stopping Fully Kiosk service');
    clearTimeout(bootReloadTimeout);
  }

  return Object.freeze({
    start,
    stop,
    device: fullyKioskHandler,
    controllers: FullyKioskController(gladys, fullyKioskHandler),
  });
};
