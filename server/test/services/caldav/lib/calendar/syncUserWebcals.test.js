const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const duration = require('dayjs/plugin/duration');
const { syncUserWebcals } = require('../../../../../services/caldav/lib/calendar/calendar.syncUserWebcals');
const { formatCalendars, formatEvents } = require('../../../../../services/caldav/lib/calendar/calendar.formaters');

dayjs.extend(timezone);
dayjs.extend(duration);

chai.use(chaiAsPromised);
const { expect } = chai;

const userId = 'f2e704c9-4c79-41b3-a5bf-914dd1a16127';
const serviceId = '5d6c666f-56be-4929-9104-718a78556844';

describe('Webcal sync', () => {
  let sync;
  beforeEach(() => {
    sync = {
      serviceId,
      syncUserWebcals,
      formatCalendars,
      formatEvents,
      gladys: {
        calendar: {
          get: sinon.stub(),
          update: sinon.stub(),
          getEvents: sinon.stub(),
          createEvent: sinon.stub(),
          updateEvent: sinon.stub(),
          destroyEvent: sinon
            .stub()
            .withArgs('event-to-delete')
            .resolves(),
        },
        http: {
          request: sinon.stub(),
        },
      },
      dayjs,
      ical: {
        parseICS: sinon.stub(),
      },
    };
  });

  it('should start sync', async () => {
    sync.gladys.calendar.get.withArgs(userId, { sync: true, type: 'WEBCAL' }).resolves([
      {
        id: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e',
        external_id: 'https://webcal.host.com/calendar1.ics',
        selector: 'calendar1',
        name: 'calendar1',
        last_sync: new Date('2022-05-05T14:00:00.000Z'),
      },
    ]);

    sync.gladys.http.request
      .withArgs('get', 'https://webcal.host.com/calendar1.ics', null)
      .resolves({ data: 'all-events' });

    sync.ical.parseICS.withArgs('all-events').returns({
      event1: {
        type: 'VEVENT',
        params: [],
        uid: 'm17286@allrugby.com',
        class: 'PUBLIC',
        start: new Date('5Z'),
        duration: 'PT1H50M0S',
        lastmodified: new Date('2022-05-07T14:00:00.000Z'),
        location: 'France 2',
        summary: 'Champions Cup - Munster vs Toulouse',
        sequence: '2022126',
      },
      event2: {
        type: 'VEVENT',
        params: [],
        uid: 'm17295@allrugby.com',
        class: 'PUBLIC',
        start: new Date('2022-05-14T14:00:00.000Z'),
        duration: 'PT1H50M0S',
        lastmodified: new Date('2022-05-14T14:00:00.000Z'),
        location: 'France 2',
        summary: 'Champions Cup - Leinster vs Toulouse',
        sequence: '2022133',
      },
      event3: {
        type: 'VEVENT',
        params: [],
        uid: 'm14505@allrugby.com',
        class: 'PUBLIC',
        start: new Date('2022-05-21T19:05:00.000Z'),
        duration: 'PT1H50M0S',
        lastmodified: new Date('2022-05-20T19:00:00.000Z'),
        location: 'Canal +',
        summary: 'Top 14 - Brive vs Toulouse',
        sequence: '2022139',
      },
      event4: {
        type: 'VEVENT',
        params: [],
        uid: 'm14515@allrugby.com',
        class: 'PUBLIC',
        start: new Date('2022-06-05T19:05:00.000Z'),
        duration: 'PT1H50M0S',
        lastmodified: new Date('2022-05-20T19:00:00.000Z'),
        location: '',
        summary: 'Top 14 - Toulouse vs Biarritz',
        sequence: '2022139',
      },
    });

    sync.gladys.calendar.getEvents.withArgs(userId, { calendarId: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e' }).resolves([
      {
        id: 'bb9feecd-6461-4e29-a8e5-b9ed032301e8',
        calendar_id: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e',
        name: 'Top 14 - Toulouse vs La Rochelle',
        selector: 'm14501allrugbycom',
        external_id: 'm14501@allrugby.com',
        url: null,
        location: 'Canal +',
        description: null,
        start: new Date('2022-04-30T19:05:00.000Z'),
        end: new Date('2022-04-30T20:55:00.000Z'),
        full_day: false,
        created_at: new Date('2022-05-20T19:24:14.212Z'),
        updated_at: new Date('2022-05-20T19:24:14.212Z'),
        calendar: { name: 'Stade Toulousain', selector: 'stade-toulousain' },
      },
      {
        id: '344c14cf-ca7f-47b5-a16f-f718bcfed506',
        calendar_id: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e',
        name: 'Champions Cup - Munster vs Toulouse',
        selector: 'm17286allrugbycom',
        external_id: 'm17286@allrugby.com',
        url: null,
        location: 'France 2',
        description: null,
        start: new Date('2022-05-07T14:00:00.000Z'),
        end: new Date('2022-05-07T15:50:00.000Z'),
        full_day: false,
        created_at: new Date('2022-05-20T19:24:14.208Z'),
        updated_at: new Date('2022-05-20T19:24:14.208Z'),
        calendar: { name: 'Stade Toulousain', selector: 'stade-toulousain' },
      },
    ]);

    await sync.syncUserWebcals(userId);

    expect(sync.gladys.calendar.get.callCount).to.equal(1);
    expect(sync.gladys.calendar.getEvents.callCount).to.equal(1);
    expect(sync.gladys.calendar.createEvent.callCount).to.equal(3);
    expect(sync.gladys.calendar.updateEvent.callCount).to.equal(1);
    expect(sync.gladys.calendar.destroyEvent.callCount).to.equal(1);
    expect(sync.gladys.calendar.update.callCount).to.equal(1);

    expect(sync.gladys.calendar.createEvent.getCall(0).args[1].external_id).to.equal('m14515@allrugby.com');
    expect(sync.gladys.calendar.createEvent.getCall(1).args[1].external_id).to.equal('m14505@allrugby.com');
    expect(sync.gladys.calendar.createEvent.getCall(2).args[1].external_id).to.equal('m17295@allrugby.com');
    expect(sync.gladys.calendar.updateEvent.getCall(0).args[0]).to.equal('m17286allrugbycom');
    expect(sync.gladys.calendar.updateEvent.getCall(0).args[1].name).to.equal('Champions Cup - Munster vs Toulouse');
    expect(sync.gladys.calendar.destroyEvent.getCall(0).args[0]).to.equal('m14501allrugbycom');
    expect(sync.gladys.calendar.update.getCall(0).args[0]).to.equal('calendar1');
  });

  it('should not rewrite selector or external_id when updating an existing event', async () => {
    sync.gladys.calendar.get.resolves([
      {
        id: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e',
        external_id: 'https://webcal.host.com/calendar1.ics',
        selector: 'calendar1',
        name: 'calendar1',
        last_sync: new Date('2022-05-05T14:00:00.000Z'),
      },
    ]);
    sync.gladys.http.request.resolves({ data: 'all-events' });
    sync.ical.parseICS.returns({
      event1: {
        type: 'VEVENT',
        params: [],
        uid: 'm17286@allrugby.com',
        start: new Date('2022-05-07T14:00:00.000Z'),
        duration: 'PT1H50M0S',
        lastmodified: new Date('2022-05-07T14:00:00.000Z'),
        summary: 'Champions Cup - Munster vs Toulouse',
      },
    });
    sync.gladys.calendar.getEvents.resolves([
      {
        selector: 'm17286allrugbycom',
        external_id: 'm17286@allrugby.com',
        name: 'Champions Cup - Munster vs Toulouse',
      },
    ]);

    await sync.syncUserWebcals(userId);

    expect(sync.gladys.calendar.updateEvent.callCount).to.equal(1);
    const updatePayload = sync.gladys.calendar.updateEvent.getCall(0).args[1];
    expect(updatePayload).to.not.have.property('selector');
    expect(updatePayload).to.not.have.property('external_id');
    expect(sync.gladys.calendar.destroyEvent.callCount).to.equal(0);
  });

  it('should match existing events even when their stored selector is not slugified', async () => {
    // Regression: rows whose selector was rewritten raw by a previous update
    // must still be matched (by external_id), not deleted and re-created.
    sync.gladys.calendar.get.resolves([
      {
        id: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e',
        external_id: 'https://webcal.host.com/calendar1.ics',
        selector: 'calendar1',
        name: 'calendar1',
        last_sync: new Date('2022-05-05T14:00:00.000Z'),
      },
    ]);
    sync.gladys.http.request.resolves({ data: 'all-events' });
    sync.ical.parseICS.returns({
      event1: {
        type: 'VEVENT',
        params: [],
        uid: 'fybTsFwo81mNm5W8yEqM12rHXrBk@proton.me',
        start: new Date('2022-05-07T14:00:00.000Z'),
        duration: 'PT1H30M0S',
        lastmodified: new Date('2022-05-07T14:00:00.000Z'),
        summary: 'Massage',
      },
    });
    sync.gladys.calendar.getEvents.resolves([
      {
        selector: 'fybTsFwo81mNm5W8yEqM12rHXrBk@proton.me',
        external_id: 'fybTsFwo81mNm5W8yEqM12rHXrBk@proton.me',
        name: 'Massage',
      },
    ]);

    await sync.syncUserWebcals(userId);

    expect(sync.gladys.calendar.createEvent.callCount).to.equal(0);
    expect(sync.gladys.calendar.destroyEvent.callCount).to.equal(0);
    expect(sync.gladys.calendar.updateEvent.callCount).to.equal(1);
    expect(sync.gladys.calendar.updateEvent.getCall(0).args[0]).to.equal('fybTsFwo81mNm5W8yEqM12rHXrBk@proton.me');
  });

  it('should not treat events without lastmodified as always modified', async () => {
    sync.gladys.calendar.get.resolves([
      {
        id: 'fc8aabab-d3d5-4ec5-8f24-3de06761284e',
        external_id: 'https://webcal.host.com/calendar1.ics',
        selector: 'calendar1',
        name: 'calendar1',
        last_sync: new Date('2022-05-05T14:00:00.000Z'),
      },
    ]);
    sync.gladys.http.request.resolves({ data: 'all-events' });
    sync.ical.parseICS.returns({
      event1: {
        type: 'VEVENT',
        params: [],
        uid: 'no-lastmodified@proton.me',
        start: new Date('2022-05-07T14:00:00.000Z'),
        duration: 'PT1H0M0S',
        summary: 'Event without LAST-MODIFIED',
      },
      event2: {
        type: 'VEVENT',
        params: [],
        uid: 'dtstamp-only@proton.me',
        start: new Date('2022-05-08T14:00:00.000Z'),
        duration: 'PT1H0M0S',
        dtstamp: new Date('2022-05-06T14:00:00.000Z'),
        summary: 'Event with DTSTAMP newer than last sync',
      },
    });
    sync.gladys.calendar.getEvents.resolves([
      {
        selector: 'no-lastmodifiedprotonme',
        external_id: 'no-lastmodified@proton.me',
        name: 'Event without LAST-MODIFIED',
      },
      {
        selector: 'dtstamp-onlyprotonme',
        external_id: 'dtstamp-only@proton.me',
        name: 'Event with DTSTAMP newer than last sync',
      },
    ]);

    await sync.syncUserWebcals(userId);

    // event1 has no modification info: keep it, don't update, don't delete
    // event2 falls back to dtstamp, which is newer than last_sync: update
    expect(sync.gladys.calendar.createEvent.callCount).to.equal(0);
    expect(sync.gladys.calendar.destroyEvent.callCount).to.equal(0);
    expect(sync.gladys.calendar.updateEvent.callCount).to.equal(1);
    expect(sync.gladys.calendar.updateEvent.getCall(0).args[0]).to.equal('dtstamp-onlyprotonme');
  });
});
