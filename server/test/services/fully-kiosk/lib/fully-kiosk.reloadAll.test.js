const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');

const deviceA = {
  external_id: 'fully-kiosk:192.168.1.50',
  params: [
    { name: 'IP_ADDRESS', value: '192.168.1.50' },
    { name: 'PASSWORD', value: 's3cret' },
  ],
};

const deviceB = {
  external_id: 'fully-kiosk:192.168.1.51',
  params: [
    { name: 'IP_ADDRESS', value: '192.168.1.51' },
    { name: 'PASSWORD', value: 's3cret' },
  ],
};

describe('fully-kiosk reloadAll', () => {
  it('should send loadStartURL to every configured tablet', async () => {
    const gladys = {
      device: {
        get: sinon.fake.resolves([deviceA, deviceB]),
      },
    };
    const handler = new FullyKioskHandler(gladys, 'service-id');
    handler.axios = { get: sinon.fake.resolves({ data: { status: 'OK' } }) };
    await handler.reloadAll();
    expect(gladys.device.get.calledOnceWith({ service: 'fully-kiosk' })).to.equal(true);
    expect(handler.axios.get.callCount).to.equal(2);
    expect(handler.axios.get.firstCall.args[0]).to.equal(
      'http://192.168.1.50:2323/?cmd=loadStartURL&password=s3cret&type=json',
    );
    expect(handler.axios.get.secondCall.args[0]).to.equal(
      'http://192.168.1.51:2323/?cmd=loadStartURL&password=s3cret&type=json',
    );
  });

  it('should do nothing when no tablet is configured', async () => {
    const gladys = {
      device: {
        get: sinon.fake.resolves([]),
      },
    };
    const handler = new FullyKioskHandler(gladys, 'service-id');
    handler.axios = { get: sinon.fake.resolves({ data: { status: 'OK' } }) };
    await handler.reloadAll();
    expect(handler.axios.get.callCount).to.equal(0);
  });

  it('should still reload other tablets when one is unreachable', async () => {
    const gladys = {
      device: {
        get: sinon.fake.resolves([deviceA, deviceB]),
      },
    };
    const handler = new FullyKioskHandler(gladys, 'service-id');
    const get = sinon.stub();
    get.onFirstCall().rejects(new Error('ECONNREFUSED'));
    get.onSecondCall().resolves({ data: { status: 'OK' } });
    handler.axios = { get };
    await handler.reloadAll();
    expect(get.callCount).to.equal(2);
  });
});

describe('fully-kiosk service boot reload', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it('should schedule a reload of all tablets on service start', async () => {
    // eslint-disable-next-line global-require
    const FullyKioskService = require('../../../../services/fully-kiosk');
    const gladys = {
      device: {
        get: sinon.fake.resolves([deviceA]),
      },
    };
    const service = FullyKioskService(gladys, 'service-id');
    service.device.axios = { get: sinon.fake.resolves({ data: { status: 'OK' } }) };
    await service.start();
    expect(service.device.axios.get.callCount).to.equal(0);
    await clock.tickAsync(30 * 1000);
    expect(service.device.axios.get.callCount).to.equal(1);
    expect(service.device.axios.get.firstCall.args[0]).to.contain('cmd=loadStartURL');
  });

  it('should not reload after stop', async () => {
    // eslint-disable-next-line global-require
    const FullyKioskService = require('../../../../services/fully-kiosk');
    const gladys = {
      device: {
        get: sinon.fake.resolves([deviceA]),
      },
    };
    const service = FullyKioskService(gladys, 'service-id');
    service.device.axios = { get: sinon.fake.resolves({ data: { status: 'OK' } }) };
    await service.start();
    await service.stop();
    await clock.tickAsync(30 * 1000);
    expect(service.device.axios.get.callCount).to.equal(0);
  });
});
