const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');
const { EVENTS } = require('../../../../utils/constants');

const device = { external_id: 'fully-kiosk:192.168.1.50', params: [{ name: 'PASSWORD', value: 'p' }] };

describe('fully-kiosk poll', () => {
  let handler;
  let emit;
  beforeEach(() => {
    emit = sinon.fake();
    handler = new FullyKioskHandler({ event: { emit } }, 'service-id');
  });

  it('should emit NEW_STATE for screen, brightness, battery and charging', async () => {
    handler.getDeviceInfo = sinon.fake.resolves({
      isScreenOn: true,
      screenBrightness: 180,
      batteryLevel: 92,
      isPlugged: false,
    });
    await handler.poll(device);

    const emitted = emit.getCalls().map((c) => c.args[1]);
    expect(emit.getCalls().every((c) => c.args[0] === EVENTS.DEVICE.NEW_STATE)).to.equal(true);
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:screen', state: 1 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:brightness', state: 180 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:battery', state: 92 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:charging', state: 0 });
  });

  it('should support alternate deviceInfo key spellings', async () => {
    handler.getDeviceInfo = sinon.fake.resolves({ screenOn: false, plugged: true, batteryLevel: 50 });
    await handler.poll(device);
    const emitted = emit.getCalls().map((c) => c.args[1]);
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:screen', state: 0 });
    expect(emitted).to.deep.include({ device_feature_external_id: 'fully-kiosk:192.168.1.50:charging', state: 1 });
  });

  it('should not throw when the tablet is unreachable', async () => {
    handler.getDeviceInfo = sinon.fake.rejects(new Error('ECONNREFUSED'));
    await handler.poll(device); // must resolve, not reject
    expect(emit.called).to.equal(false);
  });
});
