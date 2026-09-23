/* eslint-disable require-jsdoc, jsdoc/require-jsdoc, jsdoc/require-example */
/* eslint-disable jsdoc/require-hyphen-before-param-description, jsdoc/require-description-complete-sentence */
/* eslint-disable no-restricted-syntax, promise/prefer-await-to-then */
const net = require('net');
const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  EVENTS,
} = require('../../../utils/constants');
const { BadParameters, NotFoundError } = require('../../../utils/coreErrors');

const HYSEN_DEVICE_TYPE = 0x4ead;
const PARAMS = { ADDRESS: 'IP_ADDRESS', MAC: 'MAC_ADDRESS' };
const FEATURE_SUFFIXES = {
  CURRENT: 'current-temperature',
  TARGET: 'target-temperature',
  HEATING: 'heating',
  MODE: 'mode',
};

function normalizeMac(mac) {
  const normalized = typeof mac === 'string' ? mac.replace(/[:-]/g, '').toLowerCase() : '';
  if (!/^[0-9a-f]{12}$/.test(normalized)) {
    throw new BadParameters('A valid 6-byte MAC address is required');
  }
  return normalized;
}

function isPrivateIpv4(address) {
  if (net.isIP(address) !== 4) {
    return false;
  }
  const bytes = address.split('.').map(Number);
  return (
    bytes[0] === 10 || (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] === 192 && bytes[1] === 168)
  );
}

function closeClient(client) {
  if (client && client.socket && typeof client.socket.close === 'function') {
    client.socket.close();
  }
}

/**
 * @description Manage Beok thermostats over the local Broadlink protocol.
 * @param {object} gladys Gladys instance.
 * @param {object} broadlink node-broadlink module.
 * @param {string} serviceId Service identifier.
 */
function BeokLocalHandler(gladys, broadlink, serviceId) {
  this.gladys = gladys;
  this.broadlink = broadlink;
  this.serviceId = serviceId;
  this.clients = new Map();
  this.queues = new Map();
  this.stopped = false;
}

BeokLocalHandler.prototype.init = async function init() {
  this.stopped = false;
};

BeokLocalHandler.prototype.createClient = function createClient(address, mac) {
  return this.broadlink.genDevice(HYSEN_DEVICE_TYPE, { address, port: 80 }, Array.from(Buffer.from(mac, 'hex')));
};

BeokLocalHandler.prototype.authenticate = async function authenticate(address, mac, initialClient) {
  let client = initialClient || this.createClient(address, mac);
  try {
    await client.auth();
  } catch (error) {
    closeClient(client);
    client = this.createClient(address, mac);
    try {
      await client.auth();
    } catch (retryError) {
      closeClient(client);
      throw retryError;
    }
  }
  if (this.stopped) {
    closeClient(client);
    throw new Error('Beok local service is stopped');
  }
  this.clients.set(mac, { address, client });
  return client;
};

BeokLocalHandler.prototype.invalidate = function invalidate(mac) {
  const entry = this.clients.get(mac);
  if (entry) {
    closeClient(entry.client);
    this.clients.delete(mac);
  }
};

BeokLocalHandler.prototype.runSerialized = function runSerialized(mac, task) {
  const previous = this.queues.get(mac) || Promise.resolve();
  const current = previous.catch(() => null).then(task);
  this.queues.set(mac, current);
  const cleanup = () => {
    if (this.queues.get(mac) === current) {
      this.queues.delete(mac);
    }
  };
  current.then(cleanup, cleanup);
  return current;
};

BeokLocalHandler.prototype.execute = function execute(address, mac, operation, initialClient) {
  return this.runSerialized(mac, async () => {
    const entry = this.clients.get(mac);
    let client = entry ? entry.client : await this.authenticate(address, mac, initialClient);
    try {
      return await operation(client);
    } catch (error) {
      this.invalidate(mac);
      client = await this.authenticate(address, mac);
      return operation(client);
    }
  });
};

BeokLocalHandler.prototype.buildDevice = function buildDevice(address, mac, status) {
  const externalId = `beok-local:${mac}`;
  const feature = (name, suffix, category, type, options) => ({
    name,
    external_id: `${externalId}:${suffix}`,
    selector: `${externalId}:${suffix}`,
    category,
    type,
    ...options,
  });
  const device = {
    name: 'Beok thermostat',
    external_id: externalId,
    selector: externalId,
    model: 'HY02/HY03',
    service_id: this.serviceId,
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [
      { name: PARAMS.ADDRESS, value: address },
      { name: PARAMS.MAC, value: mac },
    ],
    features: [
      feature(
        'Current temperature',
        FEATURE_SUFFIXES.CURRENT,
        DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        {
          min: -50,
          max: 100,
          unit: DEVICE_FEATURE_UNITS.CELSIUS,
          read_only: true,
          has_feedback: false,
        },
      ),
      feature(
        'Target temperature',
        FEATURE_SUFFIXES.TARGET,
        DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
        DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE,
        {
          min: status.svl,
          max: status.svh,
          unit: DEVICE_FEATURE_UNITS.CELSIUS,
          read_only: false,
          has_feedback: true,
        },
      ),
      feature(
        'Heating',
        FEATURE_SUFFIXES.HEATING,
        DEVICE_FEATURE_CATEGORIES.SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        {
          min: 0,
          max: 1,
          read_only: true,
          has_feedback: false,
        },
      ),
      feature(
        'Manual mode',
        FEATURE_SUFFIXES.MODE,
        DEVICE_FEATURE_CATEGORIES.SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        {
          min: 0,
          max: 1,
          read_only: false,
          has_feedback: true,
        },
      ),
    ],
  };
  const existing = this.gladys.stateManager.get('deviceByExternalId', externalId) || {};
  return { ...existing, ...device };
};

BeokLocalHandler.prototype.discover = async function discover() {
  const discovered = await this.broadlink.discover();
  const devices = [];
  for (const client of discovered) {
    if (client.deviceType !== HYSEN_DEVICE_TYPE) {
      closeClient(client);
    } else {
      const mac = normalizeMac(Buffer.from(client.mac).toString('hex'));
      const { address } = client.host;
      // Authentication and the status request establish that this really is a reachable Hysen thermostat.
      // eslint-disable-next-line no-await-in-loop
      const status = await this.execute(
        address,
        mac,
        (authenticatedClient) => authenticatedClient.getFullStatus(),
        client,
      );
      devices.push(this.buildDevice(address, mac, status));
    }
  }
  return devices;
};

BeokLocalHandler.prototype.probe = async function probe(input = {}) {
  const { address } = input;
  if (!isPrivateIpv4(address)) {
    throw new BadParameters('A private IPv4 address is required');
  }
  const mac = normalizeMac(input.mac);
  const status = await this.execute(address, mac, (client) => client.getFullStatus());
  return this.buildDevice(address, mac, status);
};

BeokLocalHandler.prototype.getConnection = function getConnection(device) {
  const params = device && Array.isArray(device.params) ? device.params : [];
  const addressParam = params.find((param) => param.name === PARAMS.ADDRESS);
  const macParam = params.find((param) => param.name === PARAMS.MAC);
  if (!addressParam || !isPrivateIpv4(addressParam.value) || !macParam) {
    throw new BadParameters('Beok local device is not correctly configured');
  }
  return { address: addressParam.value, mac: normalizeMac(macParam.value) };
};

BeokLocalHandler.prototype.getDevice = function getDevice(externalId) {
  const device = this.gladys.stateManager.get('deviceByExternalId', externalId);
  if (!device || !externalId.startsWith('beok-local:')) {
    throw new NotFoundError('Beok local device not found');
  }
  return device;
};

BeokLocalHandler.prototype.poll = async function poll(device) {
  const { address, mac } = this.getConnection(device);
  const status = await this.execute(address, mac, (client) => client.getFullStatus());
  const values = {
    [FEATURE_SUFFIXES.CURRENT]: status.roomTemp,
    [FEATURE_SUFFIXES.TARGET]: status.thermostatTemp,
    [FEATURE_SUFFIXES.HEATING]: status.active,
    [FEATURE_SUFFIXES.MODE]: status.autoMode,
  };
  device.features.forEach((feature) => {
    const suffix = feature.external_id.split(':').pop();
    if (Object.prototype.hasOwnProperty.call(values, suffix)) {
      this.gladys.event.emit(EVENTS.DEVICE.NEW_STATE, {
        device_feature_external_id: feature.external_id,
        state: values[suffix],
      });
    }
  });
};

BeokLocalHandler.prototype.setValue = async function setValue(device, deviceFeature, value) {
  const suffix = deviceFeature.external_id.split(':').pop();
  if (suffix === FEATURE_SUFFIXES.TARGET && (!Number.isFinite(value) || value * 2 !== Math.round(value * 2))) {
    throw new BadParameters('Target temperature must use 0.5°C increments');
  }
  if (suffix === FEATURE_SUFFIXES.MODE && value !== 0 && value !== 1) {
    throw new BadParameters('Thermostat mode must be program (0) or manual (1)');
  }
  if (suffix !== FEATURE_SUFFIXES.TARGET && suffix !== FEATURE_SUFFIXES.MODE) {
    throw new BadParameters('Unsupported Beok local feature');
  }
  const { address, mac } = this.getConnection(device);
  await this.execute(address, mac, async (client) => {
    const freshStatus = await client.getFullStatus();
    if (suffix === FEATURE_SUFFIXES.TARGET) {
      if (value < freshStatus.svl || value > freshStatus.svh) {
        throw new BadParameters(`Target temperature must be between ${freshStatus.svl} and ${freshStatus.svh}°C`);
      }
      await client.setTemp(value);
    } else {
      await client.setMode(value, freshStatus.loopMode, freshStatus.sensor);
    }
  });
  return value;
};

BeokLocalHandler.prototype.getSchedule = async function getSchedule(device) {
  const { address, mac } = this.getConnection(device);
  const status = await this.execute(address, mac, (client) => client.getFullStatus());
  return { weekday: status.weekDay, weekend: status.weekEnd };
};

function validatePeriods(periods, expectedLength, minimum, maximum, group) {
  if (!Array.isArray(periods) || periods.length !== expectedLength) {
    throw new BadParameters(`${group} schedule must contain exactly ${expectedLength} periods`);
  }
  let previousMinutes = -1;
  periods.forEach((period) => {
    const { startHour, startMinute, temp } = period || {};
    const minutes = startHour * 60 + startMinute;
    if (
      !Number.isInteger(startHour) ||
      startHour < 0 ||
      startHour > 23 ||
      !Number.isInteger(startMinute) ||
      startMinute < 0 ||
      startMinute > 59 ||
      minutes <= previousMinutes
    ) {
      throw new BadParameters(`${group} schedule periods must have valid, strictly increasing start times`);
    }
    if (!Number.isFinite(temp) || temp * 2 !== Math.round(temp * 2) || temp < minimum || temp > maximum) {
      throw new BadParameters(`${group} temperatures must use 0.5°C increments between ${minimum} and ${maximum}°C`);
    }
    previousMinutes = minutes;
  });
}

BeokLocalHandler.prototype.setSchedule = async function setSchedule(device, schedule = {}) {
  const { address, mac } = this.getConnection(device);
  return this.execute(address, mac, async (client) => {
    const status = await client.getFullStatus();
    validatePeriods(schedule.weekday, 6, status.svl, status.svh, 'Weekday');
    validatePeriods(schedule.weekend, 2, status.svl, status.svh, 'Weekend');
    await client.setSchedule(schedule.weekday, schedule.weekend);
    return { weekday: schedule.weekday, weekend: schedule.weekend };
  });
};

BeokLocalHandler.prototype.stop = function stop() {
  this.stopped = true;
  this.clients.forEach(({ client }) => closeClient(client));
  this.clients.clear();
  this.queues.clear();
};

module.exports = BeokLocalHandler;
module.exports.isPrivateIpv4 = isPrivateIpv4;
module.exports.normalizeMac = normalizeMac;
