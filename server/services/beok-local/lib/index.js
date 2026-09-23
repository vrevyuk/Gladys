const net = require('net');
const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
  EVENTS,
  THERMOSTAT_MODE,
} = require('../../../utils/constants');
const { BadParameters, NotFoundError } = require('../../../utils/coreErrors');

const HYSEN_DEVICE_TYPE = 0x4ead;
const PARAMS = { ADDRESS: 'IP_ADDRESS', MAC: 'MAC_ADDRESS' };
const DAY_GROUPING_BY_LOOP_MODE = { 1: '5+2', 2: '6+1', 3: '7+0' };
const LOOP_MODE_BY_DAY_GROUPING = { '5+2': 0, '6+1': 1, '7+0': 2 };
const FEATURE_SUFFIXES = {
  CURRENT: 'current-temperature',
  TARGET: 'target-temperature',
  HEATING: 'heating',
  MODE: 'mode',
};
const PROTOCOL_TIMEOUT = 5000;

/**
 * @description Bound a Broadlink protocol request that may otherwise never settle.
 * @param {Promise<*>} request - Protocol request.
 * @param {string} operation - Operation name used in the timeout error.
 * @returns {Promise<*>} Protocol result.
 * @example await withTimeout(client.auth(), 'authentication');
 */
function withTimeout(request, operation) {
  let timeout;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Beok ${operation} timed out`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, PROTOCOL_TIMEOUT);
  });
  // The timer must be cleared regardless of which promise settles first.
  // eslint-disable-next-line promise/prefer-await-to-then
  return Promise.race([request, timeoutPromise]).then(
    (result) => {
      clearTimeout(timeout);
      return result;
    },
    (error) => {
      clearTimeout(timeout);
      throw error;
    },
  );
}

/**
 * @description Normalize and validate a MAC address.
 * @param {string} mac - MAC address.
 * @returns {string} Normalized MAC address.
 * @example normalizeMac('AA:BB:CC:DD:EE:FF');
 */
function normalizeMac(mac) {
  const normalized = typeof mac === 'string' ? mac.replace(/[:-]/g, '').toLowerCase() : '';
  if (!/^[0-9a-f]{12}$/.test(normalized)) {
    throw new BadParameters('A valid 6-byte MAC address is required');
  }
  return normalized;
}

/**
 * @description Test whether an address is a private IPv4 address.
 * @param {string} address - IP address.
 * @returns {boolean} Whether the address is private.
 * @example isPrivateIpv4('192.168.1.2');
 */
function isPrivateIpv4(address) {
  if (net.isIP(address) !== 4) {
    return false;
  }
  const bytes = address.split('.').map(Number);
  return (
    bytes[0] === 10 || (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] === 192 && bytes[1] === 168)
  );
}

/**
 * @description Test whether a failed protocol operation can safely be retried.
 * @param {Error} error - Operation error.
 * @returns {boolean} Whether the operation can be retried.
 * @example isRetryableError(new Error('socket timeout'));
 */
function isRetryableError(error) {
  if (!error || error instanceof BadParameters) {
    return false;
  }
  const retryableCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH']);
  if (retryableCodes.has(error.code)) {
    return true;
  }
  return /(?:timed? ?out|timeout|socket|auth(?:entication)?|session|checksum|corrupt|invalid response|malformed response)/i.test(
    `${error.name || ''} ${error.message || ''}`,
  );
}

/**
 * @description Convert a protocol auto-mode value to a Gladys thermostat mode.
 * @param {number} autoMode - Protocol auto-mode value.
 * @returns {number} Gladys thermostat mode.
 * @example modeFromAutoMode(0);
 */
function modeFromAutoMode(autoMode) {
  return autoMode === 1 ? THERMOSTAT_MODE.PROGRAM : THERMOSTAT_MODE.MANUAL;
}

/**
 * @description Convert a Gladys thermostat mode to a protocol auto-mode value.
 * @param {number} mode - Gladys thermostat mode.
 * @returns {number} Protocol auto-mode value.
 * @example autoModeFromMode(THERMOSTAT_MODE.PROGRAM);
 */
function autoModeFromMode(mode) {
  return mode === THERMOSTAT_MODE.PROGRAM ? 1 : 0;
}

/**
 * @description Convert full thermostat status to the schedule API contract.
 * @param {object} status - Full thermostat status.
 * @returns {object} Complete schedule.
 * @example scheduleFromStatus(status);
 */
function scheduleFromStatus(status) {
  return {
    mode: modeFromAutoMode(status.autoMode),
    dayGrouping: DAY_GROUPING_BY_LOOP_MODE[status.loopMode],
    weekday: status.weekDay,
    weekend: status.weekEnd,
  };
}

/**
 * @description Close a Broadlink client socket when available.
 * @param {object} client - Broadlink client.
 * @returns {void}
 * @example closeClient(client);
 */
function closeClient(client) {
  if (client && client.socket && typeof client.socket.close === 'function') {
    client.socket.close();
  }
}

/**
 * @description Manage Beok thermostats over the local Broadlink protocol.
 * @param {object} gladys - Gladys instance.
 * @param {object} broadlink - Node Broadlink module.
 * @param {string} serviceId - Service identifier.
 * @example new BeokLocalHandler(gladys, broadlink, serviceId);
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
    await withTimeout(client.auth(), 'authentication');
  } catch (error) {
    closeClient(client);
    if (!isRetryableError(error)) {
      throw error;
    }
    client = this.createClient(address, mac);
    try {
      await withTimeout(client.auth(), 'authentication');
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
  // Promise chaining is required to append work without awaiting the result here.
  // eslint-disable-next-line promise/prefer-await-to-then
  const current = previous.catch(() => null).then(task);
  this.queues.set(mac, current);
  const cleanup = () => {
    if (this.queues.get(mac) === current) {
      this.queues.delete(mac);
    }
  };
  // Cleanup must observe either outcome without changing the returned promise.
  // eslint-disable-next-line promise/prefer-await-to-then
  current.then(cleanup, cleanup);
  return current;
};

BeokLocalHandler.prototype.execute = function execute(address, mac, operation, initialClient) {
  return this.runSerialized(mac, async () => {
    const entry = this.clients.get(mac);
    let client = entry ? entry.client : await this.authenticate(address, mac, initialClient);
    const request = (protocolRequest, operationName = 'operation') => withTimeout(protocolRequest, operationName);
    try {
      return await operation(client, request);
    } catch (error) {
      if (!isRetryableError(error)) {
        throw error;
      }
      this.invalidate(mac);
      client = await this.authenticate(address, mac);
      try {
        // BEOK setters write absolute values, so retrying the complete operation is idempotent when a response is lost.
        return await operation(client, request);
      } catch (retryError) {
        if (isRetryableError(retryError)) {
          this.invalidate(mac);
        }
        throw retryError;
      }
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
        'Thermostat mode',
        FEATURE_SUFFIXES.MODE,
        DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
        DEVICE_FEATURE_TYPES.THERMOSTAT.MODE,
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
  // Each discovered client must be authenticated before it can be returned.
  // eslint-disable-next-line no-restricted-syntax
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
        (authenticatedClient, request) => request(authenticatedClient.getFullStatus(), 'status request'),
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
  const status = await this.execute(address, mac, (client, request) =>
    request(client.getFullStatus(), 'status request'),
  );
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

BeokLocalHandler.prototype.getDevice = function getDevice(mac) {
  const externalId = `beok-local:${normalizeMac(mac)}`;
  const device = this.gladys.stateManager.get('deviceByExternalId', externalId);
  if (!device || device.service_id !== this.serviceId) {
    throw new NotFoundError('Beok local device not found');
  }
  return device;
};

BeokLocalHandler.prototype.emitStatus = function emitStatus(device, status) {
  const values = {
    [FEATURE_SUFFIXES.CURRENT]: status.roomTemp,
    [FEATURE_SUFFIXES.TARGET]: status.thermostatTemp,
    [FEATURE_SUFFIXES.HEATING]: Number(Boolean(status.power && status.active)),
    [FEATURE_SUFFIXES.MODE]: modeFromAutoMode(status.autoMode),
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

BeokLocalHandler.prototype.poll = async function poll(device) {
  const { address, mac } = this.getConnection(device);
  const status = await this.execute(address, mac, (client, request) =>
    request(client.getFullStatus(), 'status request'),
  );
  this.emitStatus(device, status);
};

BeokLocalHandler.prototype.setValue = async function setValue(device, deviceFeature, value) {
  const suffix = deviceFeature.external_id.split(':').pop();
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (
    suffix === FEATURE_SUFFIXES.TARGET &&
    (!Number.isFinite(numericValue) || numericValue * 2 !== Math.round(numericValue * 2))
  ) {
    throw new BadParameters('Target temperature must use 0.5°C increments');
  }
  if (
    suffix === FEATURE_SUFFIXES.MODE &&
    numericValue !== THERMOSTAT_MODE.MANUAL &&
    numericValue !== THERMOSTAT_MODE.PROGRAM
  ) {
    throw new BadParameters('Thermostat mode must be manual (0) or program (1)');
  }
  if (suffix !== FEATURE_SUFFIXES.TARGET && suffix !== FEATURE_SUFFIXES.MODE) {
    throw new BadParameters('Unsupported Beok local feature');
  }
  const { address, mac } = this.getConnection(device);
  const status = await this.execute(address, mac, async (client, request) => {
    const freshStatus = await request(client.getFullStatus(), 'status request');
    if (suffix === FEATURE_SUFFIXES.TARGET) {
      if (numericValue < freshStatus.svl || numericValue > freshStatus.svh) {
        throw new BadParameters(`Target temperature must be between ${freshStatus.svl} and ${freshStatus.svh}°C`);
      }
      await request(client.setTemp(numericValue), 'target temperature write');
    } else {
      await request(
        client.setMode(autoModeFromMode(numericValue), Math.max(freshStatus.loopMode - 1, 0), freshStatus.sensor),
        'mode write',
      );
    }
    return request(client.getFullStatus(), 'write readback');
  });
  this.emitStatus(device, status);
  return numericValue;
};

BeokLocalHandler.prototype.getSchedule = async function getSchedule(device) {
  const { address, mac } = this.getConnection(device);
  const status = await this.execute(address, mac, (client, request) =>
    request(client.getFullStatus(), 'status request'),
  );
  return scheduleFromStatus(status);
};

/**
 * @description Validate one group of thermostat schedule periods.
 * @param {Array<object>} periods - Schedule periods.
 * @param {number} expectedLength - Required period count.
 * @param {number} minimum - Minimum temperature.
 * @param {number} maximum - Maximum temperature.
 * @param {string} group - Group name used in errors.
 * @returns {void}
 * @example validatePeriods(periods, 6, 5, 35, 'Weekday');
 */
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
  if (schedule.mode !== THERMOSTAT_MODE.MANUAL && schedule.mode !== THERMOSTAT_MODE.PROGRAM) {
    throw new BadParameters('Thermostat mode must be manual (0) or program (1)');
  }
  if (!Object.prototype.hasOwnProperty.call(LOOP_MODE_BY_DAY_GROUPING, schedule.dayGrouping)) {
    throw new BadParameters('Day grouping must be 5+2, 6+1, or 7+0');
  }
  const { address, mac } = this.getConnection(device);
  const status = await this.execute(address, mac, async (client, request) => {
    const currentStatus = await request(client.getFullStatus(), 'status request');
    validatePeriods(schedule.weekday, 6, currentStatus.svl, currentStatus.svh, 'Weekday');
    validatePeriods(schedule.weekend, 2, currentStatus.svl, currentStatus.svh, 'Weekend');
    await request(client.setSchedule(schedule.weekday, schedule.weekend), 'schedule write');
    const freshStatus = await request(client.getFullStatus(), 'schedule readback');
    await request(
      client.setMode(
        autoModeFromMode(schedule.mode),
        LOOP_MODE_BY_DAY_GROUPING[schedule.dayGrouping],
        freshStatus.sensor,
      ),
      'mode write',
    );
    return request(client.getFullStatus(), 'write readback');
  });
  this.emitStatus(device, status);
  return scheduleFromStatus(status);
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
module.exports.isRetryableError = isRetryableError;
