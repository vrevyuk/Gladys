/* eslint-disable require-jsdoc, jsdoc/require-jsdoc, no-restricted-syntax */
const { expect } = require('chai');
const sinon = require('sinon');

const BeokLocalHandler = require('../../../../services/beok-local/lib');
const { BadParameters } = require('../../../../utils/coreErrors');

const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  EVENTS,
  THERMOSTAT_MODE,
} = require('../../../../utils/constants');

const { assert } = sinon;
const { isRetryableError } = BeokLocalHandler;

const MAC = 'aabbccddeeff';
const status = {
  roomTemp: 19.5,
  thermostatTemp: 21,
  power: 1,
  active: 1,
  autoMode: 0,
  loopMode: 2,
  sensor: 1,
  svl: 5,
  svh: 35,
  weekDay: [
    { startHour: 6, startMinute: 0, temp: 20 },
    { startHour: 8, startMinute: 0, temp: 18 },
    { startHour: 11, startMinute: 30, temp: 20 },
    { startHour: 13, startMinute: 30, temp: 18 },
    { startHour: 17, startMinute: 0, temp: 21 },
    { startHour: 22, startMinute: 0, temp: 17 },
  ],
  weekEnd: [
    { startHour: 7, startMinute: 0, temp: 20 },
    { startHour: 23, startMinute: 0, temp: 17 },
  ],
};

function makeDevice() {
  return {
    external_id: `beok-local:${MAC}`,
    service_id: 'service-id',
    params: [
      { name: 'IP_ADDRESS', value: '192.168.1.20' },
      { name: 'MAC_ADDRESS', value: MAC },
      { name: 'KEY', value: 'must-not-be-used' },
    ],
    features: ['current-temperature', 'target-temperature', 'heating', 'mode'].map((suffix) => ({
      external_id: `beok-local:${MAC}:${suffix}`,
    })),
  };
}

function setup() {
  const client = {
    deviceType: 0x4ead,
    host: { address: '192.168.1.20', port: 80 },
    mac: Buffer.from(MAC, 'hex'),
    model: 'HY02/HY03',
    manufacturer: 'Hysen',
    auth: sinon.stub().resolves(),
    getFullStatus: sinon.stub().resolves(status),
    setTemp: sinon.stub().resolves(),
    setMode: sinon.stub().resolves(),
    setSchedule: sinon.stub().resolves(),
    socket: { close: sinon.stub() },
  };
  const broadlink = {
    discover: sinon.stub().resolves([client, { deviceType: 1, socket: { close: sinon.stub() } }]),
    genDevice: sinon.stub().returns(client),
  };
  const gladys = {
    event: { emit: sinon.stub() },
    stateManager: { get: sinon.stub() },
  };
  return { client, broadlink, gladys, handler: new BeokLocalHandler(gladys, broadlink, 'service-id') };
}

describe('BeokLocalHandler', () => {
  it('discovers only Hysen devices, authenticates, and builds stable devices', async () => {
    const { handler, client } = setup();
    const devices = await handler.discover();
    expect(devices).to.have.length(1);
    expect(devices[0].external_id).to.equal(`beok-local:${MAC}`);
    expect(devices[0].features[3]).to.include({
      category: DEVICE_FEATURE_CATEGORIES.THERMOSTAT,
      type: DEVICE_FEATURE_TYPES.THERMOSTAT.MODE,
    });
    expect(THERMOSTAT_MODE).to.deep.equal({ MANUAL: 0, PROGRAM: 1 });
    expect(devices[0].params).to.deep.equal([
      { name: 'IP_ADDRESS', value: '192.168.1.20' },
      { name: 'MAC_ADDRESS', value: MAC },
    ]);
    assert.calledOnce(client.auth);
    assert.calledOnce(client.getFullStatus);
  });

  it('probes a private IPv4 and normalized MAC while ignoring supplied credentials', async () => {
    const { handler, broadlink } = setup();
    const device = await handler.probe({
      address: '10.0.0.2',
      mac: 'AA:BB:CC:DD:EE:FF',
      key: 'ignored',
      password: 'ignored',
    });
    expect(device.external_id).to.equal(`beok-local:${MAC}`);
    expect(broadlink.genDevice.firstCall.args).to.deep.equal([
      0x4ead,
      { address: '10.0.0.2', port: 80 },
      [170, 187, 204, 221, 238, 255],
    ]);
  });

  it('rejects public/invalid addresses and malformed MACs', async () => {
    const { handler } = setup();
    for (const input of [
      { address: '8.8.8.8', mac: MAC },
      { address: '192.168.1.999', mac: MAC },
      { address: '192.168.1.2', mac: 'bad' },
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(handler.probe(input)).to.be.rejected;
    }
  });

  it('polls once and emits mapped thermostat states', async () => {
    const { handler, gladys, client } = setup();
    await handler.poll(makeDevice());
    assert.calledOnce(client.getFullStatus);
    expect(gladys.event.emit.getCalls().map((call) => call.args)).to.deep.equal([
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:current-temperature`, state: 19.5 }],
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:target-temperature`, state: 21 }],
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:heating`, state: 1 }],
      [
        EVENTS.DEVICE.NEW_STATE,
        { device_feature_external_id: `beok-local:${MAC}:mode`, state: THERMOSTAT_MODE.MANUAL },
      ],
    ]);
  });

  it('emits heating off when the active bit remains set while power is off', async () => {
    const { handler, gladys, client } = setup();
    client.getFullStatus.resolves({ ...status, power: 0, active: 1 });
    await handler.poll(makeDevice());
    expect(gladys.event.emit.getCall(2).args[1].state).to.equal(0);
  });

  it('sets target and maps public thermostat modes while preserving loop grouping and sensor', async () => {
    const { handler, client } = setup();
    const device = makeDevice();
    expect(await handler.setValue(device, device.features[1], '22.5')).to.equal(22.5);
    expect(await handler.setValue(device, device.features[3], String(THERMOSTAT_MODE.MANUAL))).to.equal(
      THERMOSTAT_MODE.MANUAL,
    );
    await handler.setValue(device, device.features[3], THERMOSTAT_MODE.PROGRAM);
    client.getFullStatus.resolves({ ...status, loopMode: 0 });
    await handler.setValue(device, device.features[3], THERMOSTAT_MODE.MANUAL);
    assert.callCount(client.getFullStatus, 8);
    assert.calledWithExactly(client.setTemp, 22.5);
    expect(client.setMode.getCalls().map((call) => call.args)).to.deep.equal([
      [0, 1, 1],
      [1, 1, 1],
      [0, 0, 1],
    ]);
  });

  it('rejects unknown features and invalid target/mode values', async () => {
    const { handler } = setup();
    const device = makeDevice();
    await expect(handler.setValue(device, { external_id: 'unknown' }, 1)).to.be.rejected;
    await expect(handler.setValue(device, device.features[1], 22.2)).to.be.rejected;
    await expect(handler.setValue(device, device.features[1], 40)).to.be.rejected;
    await expect(handler.setValue(device, device.features[3], 2)).to.be.rejected;
  });

  it('decodes every protocol mode and day grouping in schedules', async () => {
    const { handler, client } = setup();
    const expected = [
      { autoMode: 0, loopMode: 1, mode: THERMOSTAT_MODE.MANUAL, dayGrouping: '5+2' },
      { autoMode: 1, loopMode: 2, mode: THERMOSTAT_MODE.PROGRAM, dayGrouping: '6+1' },
      { autoMode: 1, loopMode: 3, mode: THERMOSTAT_MODE.PROGRAM, dayGrouping: '7+0' },
    ];
    for (const mapping of expected) {
      client.getFullStatus.resolves({ ...status, autoMode: mapping.autoMode, loopMode: mapping.loopMode });
      // eslint-disable-next-line no-await-in-loop
      expect(await handler.getSchedule(makeDevice())).to.deep.equal({
        mode: mapping.mode,
        dayGrouping: mapping.dayGrouping,
        weekday: status.weekDay,
        weekend: status.weekEnd,
      });
    }
  });

  it('sets every grouping, preserves a fresh sensor, and returns device readback', async () => {
    const expected = [
      { dayGrouping: '5+2', setter: 0, mode: THERMOSTAT_MODE.MANUAL, autoMode: 0 },
      { dayGrouping: '6+1', setter: 1, mode: THERMOSTAT_MODE.PROGRAM, autoMode: 1 },
      { dayGrouping: '7+0', setter: 2, mode: THERMOSTAT_MODE.PROGRAM, autoMode: 1 },
    ];
    for (const mapping of expected) {
      const { handler, client } = setup();
      const fresh = { ...status, sensor: 2 };
      const readback = { ...status, autoMode: mapping.autoMode, loopMode: mapping.setter + 1, thermostatTemp: 22 };
      client.getFullStatus.onCall(0).resolves(status);
      client.getFullStatus.onCall(1).resolves(fresh);
      client.getFullStatus.onCall(2).resolves(readback);
      // eslint-disable-next-line no-await-in-loop
      const result = await handler.setSchedule(makeDevice(), {
        mode: mapping.mode,
        dayGrouping: mapping.dayGrouping,
        weekday: status.weekDay,
        weekend: status.weekEnd,
      });
      expect(client.setSchedule.firstCall.callId).to.be.lessThan(client.getFullStatus.getCall(1).callId);
      expect(client.getFullStatus.getCall(1).callId).to.be.lessThan(client.setMode.firstCall.callId);
      expect(client.setMode.firstCall.callId).to.be.lessThan(client.getFullStatus.getCall(2).callId);
      assert.calledWithExactly(client.setMode, mapping.autoMode, mapping.setter, 2);
      expect(result).to.deep.equal({
        mode: mapping.mode,
        dayGrouping: mapping.dayGrouping,
        weekday: readback.weekDay,
        weekend: readback.weekEnd,
      });
    }
  });

  it('validates schedule mode, grouping, period count, order, and temperature', async () => {
    const { handler } = setup();
    const valid = {
      mode: THERMOSTAT_MODE.MANUAL,
      dayGrouping: '5+2',
      weekday: status.weekDay,
      weekend: status.weekEnd,
    };
    await expect(handler.setSchedule(makeDevice(), { ...valid, mode: 2 })).to.be.rejected;
    await expect(handler.setSchedule(makeDevice(), { ...valid, dayGrouping: 'invalid' })).to.be.rejected;
    await expect(handler.setSchedule(makeDevice(), { ...valid, weekday: status.weekDay.slice(1) })).to.be.rejected;
    const unordered = status.weekDay.map((period) => ({ ...period }));
    unordered[1].startHour = 5;
    await expect(handler.setSchedule(makeDevice(), { ...valid, weekday: unordered })).to.be.rejected;
    const badStep = status.weekDay.map((period) => ({ ...period }));
    badStep[0].temp = 20.2;
    await expect(handler.setSchedule(makeDevice(), { ...valid, weekday: badStep })).to.be.rejected;
  });

  it('serializes operations and retries once with a recreated authenticated client', async () => {
    const { handler, broadlink, client } = setup();
    const replacement = { ...client, auth: sinon.stub().resolves(), getFullStatus: sinon.stub().resolves(status) };
    broadlink.genDevice.returns(replacement);
    handler.clients.set(MAC, { address: '192.168.1.20', client });
    client.getFullStatus.onFirstCall().rejects(Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' }));
    await handler.poll(makeDevice());
    assert.calledOnce(replacement.auth);
    assert.calledOnce(replacement.getFullStatus);
    assert.calledOnce(client.socket.close);
  });

  it('times out an unanswered operation, recreates the session once, and recovers the queue', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const { handler, broadlink, client } = setup();
      const replacement = {
        ...client,
        auth: sinon.stub().resolves(),
        getFullStatus: sinon.stub().resolves(status),
        socket: { close: sinon.stub() },
      };
      broadlink.genDevice.returns(replacement);
      handler.clients.set(MAC, { address: '192.168.1.20', client });
      client.getFullStatus.returns(new Promise(() => {}));

      const pollPromise = handler.poll(makeDevice());
      await clock.tickAsync(5000);
      await pollPromise;

      assert.calledOnce(client.socket.close);
      assert.calledOnce(replacement.auth);
      assert.calledOnce(replacement.getFullStatus);
      expect(handler.queues.size).to.equal(0);

      await handler.getSchedule(makeDevice());
      assert.calledTwice(replacement.getFullStatus);
    } finally {
      clock.restore();
    }
  });

  it('bounds unanswered authentication retries, closes both sockets, and releases the queue', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const { handler, broadlink } = setup();
      const clients = [0, 1].map(() => ({
        auth: sinon.stub().returns(new Promise(() => {})),
        socket: { close: sinon.stub() },
      }));
      broadlink.genDevice.onCall(0).returns(clients[0]);
      broadlink.genDevice.onCall(1).returns(clients[1]);

      const pollPromise = handler.poll(makeDevice());
      const rejection = expect(pollPromise).to.be.rejectedWith('timed out');
      await clock.tickAsync(10000);
      await rejection;

      assert.calledTwice(broadlink.genDevice);
      clients.forEach(({ auth, socket }) => {
        assert.calledOnce(auth);
        assert.calledOnce(socket.close);
      });
      expect(handler.queues.size).to.equal(0);

      const healthyClient = {
        ...clients[1],
        auth: sinon.stub().resolves(),
        getFullStatus: sinon.stub().resolves(status),
      };
      broadlink.genDevice.reset();
      broadlink.genDevice.returns(healthyClient);
      await handler.poll(makeDevice());
      assert.calledOnce(healthyClient.getFullStatus);
    } finally {
      clock.restore();
    }
  });

  it('invalidates the replacement client when the single operation retry also times out', async () => {
    const clock = sinon.useFakeTimers();
    try {
      const { handler, broadlink, client } = setup();
      const replacement = {
        ...client,
        auth: sinon.stub().resolves(),
        getFullStatus: sinon.stub().returns(new Promise(() => {})),
        socket: { close: sinon.stub() },
      };
      broadlink.genDevice.returns(replacement);
      handler.clients.set(MAC, { address: '192.168.1.20', client });
      client.getFullStatus.returns(new Promise(() => {}));

      const pollPromise = handler.poll(makeDevice());
      const rejection = expect(pollPromise).to.be.rejectedWith('timed out');
      await clock.tickAsync(10000);
      await rejection;

      assert.calledOnce(client.getFullStatus);
      assert.calledOnce(replacement.getFullStatus);
      assert.calledOnce(client.socket.close);
      assert.calledOnce(replacement.socket.close);
      expect(handler.clients.has(MAC)).to.equal(false);
      expect(handler.queues.size).to.equal(0);
    } finally {
      clock.restore();
    }
  });

  it('retries idempotent writes after an ambiguous readback timeout and only emits reconciled state', async () => {
    const clock = sinon.useFakeTimers();
    try {
      for (const write of [
        { featureIndex: 1, value: 22.5, setter: 'setTemp' },
        { featureIndex: 3, value: THERMOSTAT_MODE.PROGRAM, setter: 'setMode' },
      ]) {
        const { handler, broadlink, gladys, client } = setup();
        const readback = { ...status, roomTemp: 20, thermostatTemp: 22.5, autoMode: 1 };
        const replacement = {
          ...client,
          auth: sinon.stub().resolves(),
          getFullStatus: sinon.stub(),
          setTemp: sinon.stub().resolves(),
          setMode: sinon.stub().resolves(),
          socket: { close: sinon.stub() },
        };
        client.getFullStatus.onCall(0).resolves(status);
        client.getFullStatus.onCall(1).returns(new Promise(() => {}));
        replacement.getFullStatus.onCall(0).resolves(status);
        replacement.getFullStatus.onCall(1).resolves(readback);
        broadlink.genDevice.returns(replacement);
        handler.clients.set(MAC, { address: '192.168.1.20', client });

        const writePromise = handler.setValue(makeDevice(), makeDevice().features[write.featureIndex], write.value);
        // The loop exercises both writable feature types with the same timeout boundary.
        // eslint-disable-next-line no-await-in-loop
        await clock.tickAsync(5000);
        // eslint-disable-next-line no-await-in-loop
        await writePromise;

        assert.calledOnce(client[write.setter]);
        assert.calledOnce(replacement[write.setter]);
        assert.calledOnce(client.socket.close);
        expect(gladys.event.emit.getCalls().map((call) => call.args[1].state)).to.deep.equal([
          20,
          22.5,
          1,
          THERMOSTAT_MODE.PROGRAM,
        ]);
      }

      const { handler, broadlink, gladys, client } = setup();
      const readback = { ...status, roomTemp: 20, thermostatTemp: 22.5, autoMode: 1 };
      const replacement = {
        ...client,
        auth: sinon.stub().resolves(),
        getFullStatus: sinon.stub(),
        setSchedule: sinon.stub().resolves(),
        setMode: sinon.stub().resolves(),
        socket: { close: sinon.stub() },
      };
      client.getFullStatus.onCall(0).resolves(status);
      client.getFullStatus.onCall(1).resolves(status);
      client.getFullStatus.onCall(2).returns(new Promise(() => {}));
      replacement.getFullStatus.onCall(0).resolves(status);
      replacement.getFullStatus.onCall(1).resolves(status);
      replacement.getFullStatus.onCall(2).resolves(readback);
      broadlink.genDevice.returns(replacement);
      handler.clients.set(MAC, { address: '192.168.1.20', client });

      const schedulePromise = handler.setSchedule(makeDevice(), {
        mode: THERMOSTAT_MODE.PROGRAM,
        dayGrouping: '5+2',
        weekday: status.weekDay,
        weekend: status.weekEnd,
      });
      await clock.tickAsync(5000);
      await schedulePromise;

      assert.calledOnce(client.setSchedule);
      assert.calledOnce(client.setMode);
      assert.calledOnce(replacement.setSchedule);
      assert.calledOnce(replacement.setMode);
      assert.calledOnce(client.socket.close);
      expect(gladys.event.emit.getCalls().map((call) => call.args[1].state)).to.deep.equal([
        20,
        22.5,
        1,
        THERMOSTAT_MODE.PROGRAM,
      ]);
    } finally {
      clock.restore();
    }
  });

  it('emits authoritative readback states after target, mode, and schedule writes', async () => {
    const { handler, gladys, client } = setup();
    const device = makeDevice();
    const readback = { ...status, roomTemp: 20, thermostatTemp: 22.5, power: 1, active: 0, autoMode: 1 };

    client.getFullStatus.onCall(0).resolves(status);
    client.getFullStatus.onCall(1).resolves(readback);
    await handler.setValue(device, device.features[1], 22.5);
    expect(gladys.event.emit.getCalls().map((call) => call.args[1].state)).to.deep.equal([
      20,
      22.5,
      0,
      THERMOSTAT_MODE.PROGRAM,
    ]);

    gladys.event.emit.resetHistory();
    client.getFullStatus.reset();
    client.getFullStatus.onCall(0).resolves(status);
    client.getFullStatus.onCall(1).resolves(readback);
    await handler.setValue(device, device.features[3], THERMOSTAT_MODE.PROGRAM);
    expect(gladys.event.emit.getCalls().map((call) => call.args[1].state)).to.deep.equal([
      20,
      22.5,
      0,
      THERMOSTAT_MODE.PROGRAM,
    ]);

    gladys.event.emit.resetHistory();
    client.getFullStatus.reset();
    client.getFullStatus.onCall(0).resolves(status);
    client.getFullStatus.onCall(1).resolves(status);
    client.getFullStatus.onCall(2).resolves(readback);
    await handler.setSchedule(device, {
      mode: THERMOSTAT_MODE.PROGRAM,
      dayGrouping: '5+2',
      weekday: status.weekDay,
      weekend: status.weekEnd,
    });
    expect(gladys.event.emit.getCalls().map((call) => call.args[1].state)).to.deep.equal([
      20,
      22.5,
      0,
      THERMOSTAT_MODE.PROGRAM,
    ]);
  });

  it('does not retry bad parameters or unknown operation errors', async () => {
    const { handler, broadlink, client } = setup();
    handler.clients.set(MAC, { address: '192.168.1.20', client });
    client.getFullStatus.rejects(new Error('business rule failed'));
    await expect(handler.poll(makeDevice())).to.be.rejectedWith('business rule failed');
    assert.notCalled(client.auth);
    assert.notCalled(broadlink.genDevice);

    client.getFullStatus.rejects(new BadParameters('invalid value'));
    await expect(handler.poll(makeDevice())).to.be.rejectedWith('invalid value');
    assert.notCalled(client.auth);
  });

  it('only retries known network, session, auth, and response-corruption failures', () => {
    expect(isRetryableError(Object.assign(new Error('failure'), { code: 'ECONNRESET' }))).to.equal(true);
    expect(isRetryableError(new Error('authentication expired'))).to.equal(true);
    expect(isRetryableError(new Error('checksum mismatch'))).to.equal(true);
    expect(isRetryableError(new Error('business rule failed'))).to.equal(false);
    expect(isRetryableError(new BadParameters('socket value is invalid'))).to.equal(false);
    expect(isRetryableError(null)).to.equal(false);
  });

  it('covers lifecycle, authentication failures, and device lookup validation', async () => {
    const { handler, broadlink, gladys, client } = setup();
    handler.stopped = true;
    await handler.init();
    expect(handler.stopped).to.equal(false);

    const invalid = { auth: sinon.stub().rejects(new BadParameters('invalid auth')), socket: { close: sinon.stub() } };
    await expect(handler.authenticate('172.16.0.2', MAC, invalid)).to.be.rejectedWith('invalid auth');
    assert.calledOnce(invalid.auth);
    assert.calledOnce(invalid.socket.close);

    const failed = { auth: sinon.stub().rejects(new Error('auth failed')), socket: { close: sinon.stub() } };
    broadlink.genDevice.returns(failed);
    await expect(handler.authenticate('172.16.0.2', MAC, failed)).to.be.rejectedWith('auth failed');
    assert.calledTwice(failed.auth);
    assert.calledTwice(failed.socket.close);

    broadlink.genDevice.returns(client);
    handler.stopped = true;
    await expect(handler.authenticate('192.168.1.20', MAC)).to.be.rejectedWith('stopped');
    handler.invalidate('missing');

    expect(() => handler.getConnection()).to.throw('not correctly configured');
    gladys.stateManager.get.returns(undefined);
    expect(() => handler.getDevice(MAC)).to.throw('not found');
    expect(() => handler.getDevice('bad')).to.throw('valid 6-byte MAC');
    gladys.stateManager.get.returns({ ...makeDevice(), service_id: 'another-service' });
    expect(() => handler.getDevice(MAC)).to.throw('not found');
    gladys.stateManager.get.returns(makeDevice());
    expect(handler.getDevice('AA:BB:CC:DD:EE:FF')).to.deep.equal(makeDevice());
  });

  it('cleans up clients and discovery resources on stop', async () => {
    const { handler, client } = setup();
    await handler.discover();
    handler.stop();
    assert.calledOnce(client.socket.close);
    expect(handler.clients.size).to.equal(0);
  });
});
