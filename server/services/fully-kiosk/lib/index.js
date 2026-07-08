const axios = require('axios');
const { DEFAULT_TIMEOUT } = require('./fully-kiosk.constants');
const { buildCommandUrl, sendCommand, getDeviceInfo } = require('./fully-kiosk.command');
const { setValue } = require('./fully-kiosk.setValue');
const { poll } = require('./fully-kiosk.poll');

/**
 * @description Handler for the Fully Kiosk Browser integration.
 * @param {object} gladys - The Gladys instance.
 * @param {string} serviceId - The UUID of this service in DB.
 * @example
 * const handler = new FullyKioskHandler(gladys, serviceId);
 */
const FullyKioskHandler = function FullyKioskHandler(gladys, serviceId) {
  this.gladys = gladys;
  this.serviceId = serviceId;
  // @ts-ignore
  this.axios = axios.create({ timeout: DEFAULT_TIMEOUT });
};

FullyKioskHandler.prototype.buildCommandUrl = buildCommandUrl;
FullyKioskHandler.prototype.sendCommand = sendCommand;
FullyKioskHandler.prototype.getDeviceInfo = getDeviceInfo;
FullyKioskHandler.prototype.setValue = setValue;
FullyKioskHandler.prototype.poll = poll;

module.exports = FullyKioskHandler;
