const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const { destroyCalendar } = require('../../../../../services/caldav/lib/calendar/calendar.destroyCalendar');

chai.use(chaiAsPromised);
const { expect } = chai;

const userId = 'f2e704c9-4c79-41b3-a5bf-914dd1a16127';

describe('destroyCalendar', () => {
  it('should destroy an owned calendar by selector', async () => {
    const self = {
      destroyCalendar,
      gladys: {
        calendar: {
          get: sinon.stub().resolves([{ selector: 'my-proton-calendar', user_id: userId }]),
          destroy: sinon.stub().resolves(),
        },
      },
    };
    await self.destroyCalendar(userId, 'my-proton-calendar');
    expect(self.gladys.calendar.destroy.calledOnceWith('my-proton-calendar')).to.equal(true);
  });

  it('should reject when the calendar is not owned by the user', async () => {
    const self = {
      destroyCalendar,
      gladys: {
        calendar: {
          get: sinon.stub().resolves([{ selector: 'someone-else', user_id: 'another-user-id' }]),
          destroy: sinon.stub().resolves(),
        },
      },
    };
    await expect(self.destroyCalendar(userId, 'someone-else')).to.be.rejectedWith('CALENDAR_NOT_FOUND');
    expect(self.gladys.calendar.destroy.called).to.equal(false);
  });
});
