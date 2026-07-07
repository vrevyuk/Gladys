const { expect } = require('chai');
const sinon = require('sinon');
const { destroyCalendar } = require('../../../../../services/caldav/lib/calendar/calendar.destroyCalendar');

describe('destroyCalendar', () => {
  it('should destroy the calendar by selector', async () => {
    const self = {
      destroyCalendar,
      gladys: { calendar: { destroy: sinon.stub().resolves() } },
    };
    await self.destroyCalendar('my-proton-calendar');
    expect(self.gladys.calendar.destroy.calledOnceWith('my-proton-calendar')).to.equal(true);
  });
});
