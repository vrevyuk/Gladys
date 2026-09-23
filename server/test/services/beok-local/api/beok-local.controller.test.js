/* eslint-disable require-jsdoc, jsdoc/require-jsdoc, no-restricted-syntax */
const sinon = require('sinon');
const Controller = require('../../../../services/beok-local/api/beok-local.controller');

const handler = {
  discover: sinon.stub().resolves(['device']),
  probe: sinon.stub().resolves('device'),
  getDevice: sinon.stub().returns({ id: 'device' }),
  getSchedule: sinon.stub().resolves({ weekday: [], weekend: [] }),
  setSchedule: sinon.stub().resolves({ weekday: [], weekend: [] }),
};

function response() {
  return { json: sinon.stub() };
}

describe('Beok local controller', () => {
  let routes;
  beforeEach(() => {
    sinon.resetHistory();
    routes = Controller(handler);
  });

  it('exposes authenticated discovery and probe APIs', async () => {
    const discoverRes = response();
    const probeRes = response();
    await routes['post /api/v1/service/beok-local/discover'].controller({}, discoverRes);
    await routes['post /api/v1/service/beok-local/probe'].controller({ body: { address: '10.0.0.2' } }, probeRes);
    sinon.assert.calledWithExactly(discoverRes.json, ['device']);
    sinon.assert.calledWithExactly(handler.probe, { address: '10.0.0.2' });
    sinon.assert.match(routes['post /api/v1/service/beok-local/probe'], { authenticated: true, admin: true });
  });

  it('exposes authenticated grouped schedule APIs', async () => {
    const getRes = response();
    const putRes = response();
    await routes['get /api/v1/service/beok-local/device/:mac/schedule'].controller(
      { params: { mac: 'aabbccddeeff' } },
      getRes,
    );
    await routes['put /api/v1/service/beok-local/device/:mac/schedule'].controller(
      { params: { mac: 'aabbccddeeff' }, body: { weekday: [], weekend: [] } },
      putRes,
    );
    sinon.assert.calledTwice(handler.getDevice);
    sinon.assert.alwaysCalledWithExactly(handler.getDevice, 'aabbccddeeff');
    sinon.assert.calledOnce(handler.getSchedule);
    sinon.assert.calledOnce(handler.setSchedule);
    sinon.assert.match(routes['get /api/v1/service/beok-local/device/:mac/schedule'], { authenticated: true });
    sinon.assert.match(routes['put /api/v1/service/beok-local/device/:mac/schedule'], {
      authenticated: true,
      admin: true,
    });
  });
});
