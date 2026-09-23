/* eslint-disable require-jsdoc, jsdoc/require-jsdoc */
const logger = require('../../utils/logger');
const BeokLocalHandler = require('./lib');
const BeokLocalController = require('./api/beok-local.controller');

module.exports = function BeokLocalService(gladys, serviceId) {
  const broadlink = require('node-broadlink');
  const handler = new BeokLocalHandler(gladys, broadlink, serviceId);

  async function start() {
    logger.info('Starting Beok local service');
    await handler.init();
  }

  async function stop() {
    logger.info('Stopping Beok local service');
    handler.stop();
  }

  return Object.freeze({
    start,
    stop,
    device: handler,
    controllers: BeokLocalController(handler),
  });
};
