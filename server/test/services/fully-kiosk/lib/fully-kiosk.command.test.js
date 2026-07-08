const { expect } = require('chai');
const sinon = require('sinon');
const FullyKioskHandler = require('../../../../services/fully-kiosk/lib');
const { buildCommandUrl } = require('../../../../services/fully-kiosk/lib/fully-kiosk.command');

const device = {
  external_id: 'fully-kiosk:192.168.1.50',
  params: [
    { name: 'IP_ADDRESS', value: '192.168.1.50' },
    { name: 'PORT', value: '2323' },
    { name: 'PASSWORD', value: 's3cret' },
  ],
};

describe('fully-kiosk buildCommandUrl', () => {
  it('should build a base command url with cmd, password and type=json', () => {
    const url = buildCommandUrl(device, 'screenOn');
    expect(url).to.equal('http://192.168.1.50:2323/?cmd=screenOn&password=s3cret&type=json');
  });

  it('should append extra params', () => {
    const url = buildCommandUrl(device, 'setStringSetting', { key: 'screenBrightness', value: 200 });
    expect(url).to.equal(
      'http://192.168.1.50:2323/?cmd=setStringSetting&password=s3cret&type=json&key=screenBrightness&value=200',
    );
  });

  it('should fall back to ip from external_id and default port 2323', () => {
    const url = buildCommandUrl(
      { external_id: 'fully-kiosk:10.0.0.9', params: [{ name: 'PASSWORD', value: 'p' }] },
      'screenOff',
    );
    expect(url).to.equal('http://10.0.0.9:2323/?cmd=screenOff&password=p&type=json');
  });

  it('should throw BadParameters when no IP can be resolved', () => {
    expect(() => buildCommandUrl({ external_id: null, params: [{ name: 'PASSWORD', value: 'p' }] }, 'screenOn')).to.throw(
      'IP address',
    );
  });
});

describe('fully-kiosk sendCommand', () => {
  it('should GET the built url on the injected axios instance', async () => {
    const handler = new FullyKioskHandler({}, 'service-id');
    handler.axios = { get: sinon.fake.resolves({ data: { status: 'OK' } }) };
    await handler.sendCommand(device, 'screenOn');
    expect(handler.axios.get.calledOnce).to.equal(true);
    expect(handler.axios.get.firstCall.args[0]).to.equal(
      'http://192.168.1.50:2323/?cmd=screenOn&password=s3cret&type=json',
    );
  });
});
