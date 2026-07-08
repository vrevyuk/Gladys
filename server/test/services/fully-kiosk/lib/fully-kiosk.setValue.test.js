const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');

const device = {
  external_id: 'fully-kiosk:192.168.1.50',
  params: [{ name: 'PASSWORD', value: 'p' }],
};

const feature = (cmd) => ({ external_id: `fully-kiosk:192.168.1.50:${cmd}` });

describe('fully-kiosk setValue', () => {
  let handler;
  beforeEach(() => {
    handler = new FullyKioskHandler({}, 'service-id');
    handler.sendCommand = sinon.fake.resolves({ data: { status: 'OK' } });
  });

  it('should turn screen on for value 1', async () => {
    await handler.setValue(device, feature('screen'), 1);
    expect(handler.sendCommand.firstCall.args[1]).to.equal('screenOn');
  });

  it('should turn screen off for value 0', async () => {
    await handler.setValue(device, feature('screen'), 0);
    expect(handler.sendCommand.firstCall.args[1]).to.equal('screenOff');
  });

  it('should set brightness via setStringSetting', async () => {
    await handler.setValue(device, feature('brightness'), 200);
    expect(handler.sendCommand.firstCall.args[1]).to.equal('setStringSetting');
    expect(handler.sendCommand.firstCall.args[2]).to.deep.equal({ key: 'screenBrightness', value: 200 });
  });

  it('should load a url', async () => {
    await handler.setValue(device, feature('load-url'), 'http://gladys/dashboard');
    expect(handler.sendCommand.firstCall.args[1]).to.equal('loadUrl');
    expect(handler.sendCommand.firstCall.args[2]).to.deep.equal({ url: 'http://gladys/dashboard' });
  });

  it('should speak text', async () => {
    await handler.setValue(device, feature('tts'), 'Someone at the door');
    expect(handler.sendCommand.firstCall.args[1]).to.equal('textToSpeech');
    expect(handler.sendCommand.firstCall.args[2]).to.deep.equal({ text: 'Someone at the door' });
  });

  it('should throw BadParameters on unknown command', async () => {
    let error;
    try {
      await handler.setValue(device, feature('unknown'), 1);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    expect(error.constructor.name).to.equal('BadParameters');
  });

  it('should throw BadParameters on wrong prefix', async () => {
    let error;
    try {
      await handler.setValue(device, { external_id: 'tasmota:x:screen' }, 1);
    } catch (e) {
      error = e;
    }
    expect(error.constructor.name).to.equal('BadParameters');
  });
});
