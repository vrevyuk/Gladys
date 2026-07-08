const logger = require('../../utils/logger');
const FullyKioskHandler = require('./lib');

module.exports = function FullyKioskService(gladys, serviceId) {
  const fullyKioskHandler = new FullyKioskHandler(gladys, serviceId);

  /**
   * @public
   * @description Start the Fully Kiosk service.
   * @example
   * gladys.services['fully-kiosk'].start();
   */
  async function start() {
    logger.info('Starting Fully Kiosk service');
  }

  /**
   * @public
   * @description Stop the Fully Kiosk service.
   * @example
   * gladys.services['fully-kiosk'].stop();
   */
  async function stop() {
    logger.info('Stopping Fully Kiosk service');
  }

  return Object.freeze({
    start,
    stop,
    device: fullyKioskHandler,
  });
};
