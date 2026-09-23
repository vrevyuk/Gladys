/* eslint-disable require-jsdoc, jsdoc/require-jsdoc */
const asyncMiddleware = require('../../../api/middlewares/asyncMiddleware');

module.exports = function BeokLocalController(handler) {
  async function discover(req, res) {
    res.json(await handler.discover());
  }

  async function probe(req, res) {
    res.json(await handler.probe(req.body));
  }

  async function getSchedule(req, res) {
    const device = handler.getDevice(req.params.externalId);
    res.json(await handler.getSchedule(device));
  }

  async function setSchedule(req, res) {
    const device = handler.getDevice(req.params.externalId);
    res.json(await handler.setSchedule(device, req.body));
  }

  return {
    'get /api/v1/service/beok-local/discover': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(discover),
    },
    'post /api/v1/service/beok-local/probe': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(probe),
    },
    'get /api/v1/service/beok-local/device/:externalId/schedule': {
      authenticated: true,
      controller: asyncMiddleware(getSchedule),
    },
    'put /api/v1/service/beok-local/device/:externalId/schedule': {
      authenticated: true,
      admin: true,
      controller: asyncMiddleware(setSchedule),
    },
  };
};
