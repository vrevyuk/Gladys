const { assert, fake, stub } = require('sinon');
const CaldavController = require('../../../../services/caldav/api/caldav.controller');

const userId = 'f2e704c9-4c79-41b3-a5bf-914dd1a16127';

const caldavService = {
  config: stub(),
  cleanUp: stub(),
  enableCalendar: stub(),
  disableCalendar: stub(),
  syncUserCalendars: stub(),
  syncUserWebcals: stub(),
  addWebcal: stub(),
  destroyCalendar: stub(),
  serviceId: 'service-id',
  gladys: {
    variable: { getValue: stub() },
  },
};

const res = {
  json: fake.returns(null),
  status: fake.returns({
    send: fake.returns(null),
    json: fake.returns(null),
  }),
};

describe('get /api/v1/service/caldav/config', () => {
  it('should return new config', async () => {
    const caldavController = CaldavController(caldavService);
    const req = {
      user: {
        id: userId,
      },
    };
    await caldavController['get /api/v1/service/caldav/config'].controller(req, res);
    assert.calledWith(caldavService.config, userId);
  });
});

describe('get /api/v1/service/caldav/cleanup', () => {
  it('should cleanup caldav data', async () => {
    const caldavController = CaldavController(caldavService);
    const req = {
      user: {
        id: userId,
      },
    };
    await caldavController['get /api/v1/service/caldav/cleanup'].controller(req, res);
    assert.calledWith(caldavService.cleanUp, userId);
  });
});

describe('get /api/v1/service/caldav/sync', () => {
  it('should sync webcals and caldav when CALDAV_URL is set', async () => {
    caldavService.gladys.variable.getValue.resolves('https://caldav.host/');
    caldavService.syncUserCalendars.resolves({});
    caldavService.syncUserWebcals.resolves({});
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId } };
    await caldavController['get /api/v1/service/caldav/sync'].controller(req, res);
    assert.calledWith(caldavService.syncUserCalendars, userId);
    assert.calledWith(caldavService.syncUserWebcals, userId);
  });

  it('should sync only webcals when CALDAV_URL is not set', async () => {
    caldavService.gladys.variable.getValue.resolves(null);
    caldavService.syncUserCalendars.resetHistory();
    caldavService.syncUserWebcals.resolves({});
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId } };
    await caldavController['get /api/v1/service/caldav/sync'].controller(req, res);
    assert.notCalled(caldavService.syncUserCalendars);
    assert.calledWith(caldavService.syncUserWebcals, userId);
  });
});

describe('patch /api/v1/service/caldav/enable', () => {
  it('should enable caldav calendar synchronization', async () => {
    const caldavController = CaldavController(caldavService);
    const req = {
      body: {
        selector: 'personnal',
      },
    };
    await caldavController['patch /api/v1/service/caldav/enable'].controller(req, res);
    assert.calledWith(caldavService.enableCalendar, 'personnal');
  });
});

describe('patch /api/v1/service/caldav/disable', () => {
  it('should disable caldav calendar synchronization', async () => {
    const caldavController = CaldavController(caldavService);
    const req = {
      body: {
        selector: 'personnal',
      },
    };
    await caldavController['patch /api/v1/service/caldav/disable'].controller(req, res);
    assert.calledWith(caldavService.disableCalendar, 'personnal');
  });
});

describe('post /api/v1/service/caldav/webcal', () => {
  it('should subscribe to a webcal url', async () => {
    caldavService.addWebcal.resolves({ selector: 'my-proton' });
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId }, body: { url: 'https://proton/cal.ics' } };
    await caldavController['post /api/v1/service/caldav/webcal'].controller(req, res);
    assert.calledWith(caldavService.addWebcal, userId, 'https://proton/cal.ics');
  });
});

describe('delete /api/v1/service/caldav/calendar/:selector', () => {
  it('should delete a calendar', async () => {
    caldavService.destroyCalendar.resolves();
    const caldavController = CaldavController(caldavService);
    const req = { user: { id: userId }, params: { selector: 'my-proton' } };
    await caldavController['delete /api/v1/service/caldav/calendar/:selector'].controller(req, res);
    assert.calledWith(caldavService.destroyCalendar, userId, 'my-proton');
  });
});
