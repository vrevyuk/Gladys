const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskController = require('../../../../services/fully-kiosk/api/fully-kiosk.controller');

const buildRes = () => {
  const res = {};
  res.json = sinon.fake.returns(res);
  res.status = sinon.fake.returns(res);
  return res;
};

describe('fully-kiosk controller: test connection', () => {
  it('should return success with device info when reachable', async () => {
    const handler = { getDeviceInfo: sinon.fake.resolves({ deviceName: 'Lenovo Tab', batteryLevel: 88 }) };
    const controller = FullyKioskController({}, handler);
    const route = controller['post /api/v1/service/fully-kiosk/tablet/test'];
    const req = { body: { params: [{ name: 'PASSWORD', value: 'p' }], external_id: 'fully-kiosk:1.2.3.4' } };
    const res = buildRes();
    await route.controller(req, res);
    expect(res.json.firstCall.args[0]).to.deep.equal({ success: true, deviceName: 'Lenovo Tab', batteryLevel: 88 });
  });

  it('should return success:false with a message when unreachable', async () => {
    const handler = { getDeviceInfo: sinon.fake.rejects(new Error('ECONNREFUSED')) };
    const controller = FullyKioskController({}, handler);
    const route = controller['post /api/v1/service/fully-kiosk/tablet/test'];
    const res = buildRes();
    await route.controller({ body: { params: [] } }, res);
    expect(res.json.firstCall.args[0].success).to.equal(false);
    expect(res.json.firstCall.args[0].message).to.be.a('string');
  });
});
