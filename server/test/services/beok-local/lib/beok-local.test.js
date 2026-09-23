/* eslint-disable require-jsdoc, jsdoc/require-jsdoc, no-restricted-syntax */
const { expect } = require('chai');
const sinon = require('sinon');

const { assert } = sinon;
const BeokLocalHandler = require('../../../../services/beok-local/lib');
const { EVENTS } = require('../../../../utils/constants');

const MAC = 'aabbccddeeff';
const status = {
  roomTemp: 19.5,
  thermostatTemp: 21,
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

  it('polls once and emits all thermostat states', async () => {
    const { handler, gladys, client } = setup();
    await handler.poll(makeDevice());
    assert.calledOnce(client.getFullStatus);
    expect(gladys.event.emit.getCalls().map((call) => call.args)).to.deep.equal([
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:current-temperature`, state: 19.5 }],
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:target-temperature`, state: 21 }],
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:heating`, state: 1 }],
      [EVENTS.DEVICE.NEW_STATE, { device_feature_external_id: `beok-local:${MAC}:mode`, state: 0 }],
    ]);
  });

  it('sets target and mode after fresh status and preserves loop/sensor', async () => {
    const { handler, client } = setup();
    const device = makeDevice();
    await handler.setValue(device, device.features[1], 22.5);
    await handler.setValue(device, device.features[3], 1);
    assert.calledTwice(client.getFullStatus);
    assert.calledWithExactly(client.setTemp, 22.5);
    assert.calledWithExactly(client.setMode, 1, 2, 1);
  });

  it('rejects unknown features and invalid target/mode values', async () => {
    const { handler } = setup();
    const device = makeDevice();
    await expect(handler.setValue(device, { external_id: 'unknown' }, 1)).to.be.rejected;
    await expect(handler.setValue(device, device.features[1], 22.2)).to.be.rejected;
    await expect(handler.setValue(device, device.features[1], 40)).to.be.rejected;
    await expect(handler.setValue(device, device.features[3], 2)).to.be.rejected;
  });

  it('gets and validates grouped schedules against live limits', async () => {
    const { handler, client } = setup();
    const device = makeDevice();
    expect(await handler.getSchedule(device)).to.deep.equal({ weekday: status.weekDay, weekend: status.weekEnd });
    await handler.setSchedule(device, { weekday: status.weekDay, weekend: status.weekEnd });
    assert.calledWithExactly(client.setSchedule, status.weekDay, status.weekEnd);

    await expect(handler.setSchedule(device, { weekday: status.weekDay.slice(1), weekend: status.weekEnd })).to.be
      .rejected;
    const unordered = status.weekDay.map((period) => ({ ...period }));
    unordered[1].startHour = 5;
    await expect(handler.setSchedule(device, { weekday: unordered, weekend: status.weekEnd })).to.be.rejected;
    const badStep = status.weekDay.map((period) => ({ ...period }));
    badStep[0].temp = 20.2;
    await expect(handler.setSchedule(device, { weekday: badStep, weekend: status.weekEnd })).to.be.rejected;
  });

  it('serializes operations and retries once with a recreated authenticated client', async () => {
    const { handler, broadlink, client } = setup();
    const replacement = { ...client, auth: sinon.stub().resolves(), getFullStatus: sinon.stub().resolves(status) };
    broadlink.genDevice.returns(replacement);
    handler.clients.set(MAC, { address: '192.168.1.20', client });
    client.getFullStatus.onFirstCall().rejects(new Error('expired session'));
    await handler.poll(makeDevice());
    assert.calledOnce(replacement.auth);
    assert.calledOnce(replacement.getFullStatus);
    assert.calledOnce(client.socket.close);
  });

  it('covers lifecycle, authentication failures, and device lookup validation', async () => {
    const { handler, broadlink, gladys, client } = setup();
    handler.stopped = true;
    await handler.init();
    expect(handler.stopped).to.equal(false);

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
    expect(() => handler.getDevice(`beok-local:${MAC}`)).to.throw('not found');
    gladys.stateManager.get.returns(makeDevice());
    expect(() => handler.getDevice(`other:${MAC}`)).to.throw('not found');
    expect(handler.getDevice(`beok-local:${MAC}`)).to.deep.equal(makeDevice());
  });

  it('cleans up clients and discovery resources on stop', async () => {
    const { handler, client } = setup();
    await handler.discover();
    handler.stop();
    assert.calledOnce(client.socket.close);
    expect(handler.clients.size).to.equal(0);
  });
});
