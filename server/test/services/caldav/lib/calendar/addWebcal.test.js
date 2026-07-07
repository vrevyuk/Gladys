const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { addWebcal } = require('../../../../../services/caldav/lib/calendar/calendar.addWebcal');

chai.use(chaiAsPromised);
const { expect } = chai;

const userId = 'f2e704c9-4c79-41b3-a5bf-914dd1a16127';
const serviceId = '5d6c666f-56be-4929-9104-718a78556844';
const url = 'https://calendar.proton.me/api/calendar/v1/url/token/calendar.ics';

describe('addWebcal', () => {
  let self;

  beforeEach(() => {
    self = {
      serviceId,
      addWebcal,
      syncUserWebcals: sinon.stub().resolves(),
      gladys: {
        http: { request: sinon.stub() },
        calendar: {
          get: sinon.stub().resolves([]),
          create: sinon.stub().resolvesArg(0),
        },
      },
    };
  });

  it('should subscribe to a webcal url, name it from the feed, and sync', async () => {
    self.gladys.http.request.resolves({
      data: 'BEGIN:VCALENDAR\nX-WR-CALNAME:My Proton\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR',
      status: 200,
    });
    const calendar = await self.addWebcal(userId, url);
    expect(calendar.name).to.equal('My Proton');
    expect(calendar.type).to.equal('WEBCAL');
    expect(calendar.external_id).to.equal(url);
    expect(calendar.service_id).to.equal(serviceId);
    expect(calendar.user_id).to.equal(userId);
    expect(calendar.sync).to.equal(true);
    expect(self.syncUserWebcals.calledOnceWith(userId)).to.equal(true);
  });

  it('should default the name when X-WR-CALNAME is absent', async () => {
    self.gladys.http.request.resolves({ data: 'BEGIN:VCALENDAR\nEND:VCALENDAR', status: 200 });
    const calendar = await self.addWebcal(userId, url);
    expect(calendar.name).to.equal('Proton Calendar');
  });

  it('should reject when url is missing', async () => {
    await expect(self.addWebcal(userId, '')).to.be.rejectedWith('MISSING_PARAMETERS');
  });

  it('should reject a duplicate url', async () => {
    self.gladys.calendar.get.resolves([{ id: 'existing' }]);
    await expect(self.addWebcal(userId, url)).to.be.rejectedWith('CALDAV_WEBCAL_ALREADY_EXISTS');
  });

  it('should reject an invalid feed (bad status)', async () => {
    self.gladys.http.request.resolves({ data: 'Not Found', status: 404 });
    await expect(self.addWebcal(userId, url)).to.be.rejectedWith('CALDAV_INVALID_WEBCAL_URL');
  });

  it('should reject an invalid feed (not iCalendar)', async () => {
    self.gladys.http.request.resolves({ data: '<html>nope</html>', status: 200 });
    await expect(self.addWebcal(userId, url)).to.be.rejectedWith('CALDAV_INVALID_WEBCAL_URL');
  });

  it('should read the name from an X-WR-CALNAME with parameters', async () => {
    self.gladys.http.request.resolves({
      data: 'BEGIN:VCALENDAR\nX-WR-CALNAME;VALUE=TEXT:Parametered Name\nEND:VCALENDAR',
      status: 200,
    });
    const calendar = await self.addWebcal(userId, url);
    expect(calendar.name).to.equal('Parametered Name');
  });
});
