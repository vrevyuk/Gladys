const asyncMiddleware = require('../../../api/middlewares/asyncMiddleware');

module.exports = function BeokLocalController(handler) {
  /**
   * @description Discover BEOK thermostats.
   * @param {object} req - Express request.
   * @param {object} res - Express response.
   * @returns {Promise<void>} Resolves when the response is sent.
   * @example await discover(req, res);
   */
  async function discover(req, res) {
    res.json(await handler.discover());
  }

  /**
   * @description Probe a thermostat at a known address.
   * @param {object} req - Express request.
   * @param {object} res - Express response.
   * @returns {Promise<void>} Resolves when the response is sent.
   * @example await probe(req, res);
   */
  async function probe(req, res) {
    res.json(await handler.probe(req.body));
  }

  /**
   * @description Get a thermostat schedule by normalized MAC address.
   * @param {object} req - Express request.
   * @param {object} res - Express response.
   * @returns {Promise<void>} Resolves when the response is sent.
   * @example await getSchedule(req, res);
   */
  async function getSchedule(req, res) {
    const device = handler.getDevice(req.params.mac);
    res.json(await handler.getSchedule(device));
  }

  /**
   * @description Set a thermostat schedule by normalized MAC address.
   * @param {object} req - Express request.
   * @param {object} res - Express response.
   * @returns {Promise<void>} Resolves when the response is sent.
   * @example await setSchedule(req, res);
   */
  async function setSchedule(req, res) {
    const device = handler.getDevice(req.params.mac);
    res.json(await handler.setSchedule(device, req.body));
  }

  return {
    'post /api/v1/service/beok-local/discover': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(discover),
    },
    'post /api/v1/service/beok-local/probe': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(probe),
    },
    'get /api/v1/service/beok-local/device/:mac/schedule': {
      authenticated: true,
      controller: asyncMiddleware(getSchedule),
    },
    'put /api/v1/service/beok-local/device/:mac/schedule': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(setSchedule),
    },
  };
};
