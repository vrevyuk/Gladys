const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const Handler = sinon.stub();
const instance = { init: sinon.stub().resolves(), stop: sinon.stub() };
Handler.returns(instance);
const Service = proxyquire('../../../services/beok-local', {
  'node-broadlink': {},
  './lib': Handler,
});

describe('BeokLocalService', () => {
  it('starts and stops its handler and exposes controllers', async () => {
    const service = Service({}, 'service-id');
    await service.start();
    await service.stop();
    sinon.assert.calledOnce(instance.init);
    sinon.assert.calledOnce(instance.stop);
    sinon.assert.match(service.controllers, sinon.match.object);
  });
});
