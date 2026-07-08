const { expect, assert } = require('chai');
const { fake, assert: sinonAssert } = require('sinon');
const {
  DASHBOARD_BOX_TYPE,
  DASHBOARD_TYPE,
  DASHBOARD_VISIBILITY,
  EVENTS,
  WEBSOCKET_MESSAGE_TYPES,
} = require('../../../utils/constants');

const Dashboard = require('../../../lib/dashboard');

describe('dashboard.create', () => {
  const event = { emit: fake.returns(null) };
  const dashboard = new Dashboard(event);
  it('should create a dashboard', async () => {
    const newDashboard = await dashboard.create('0cd30aef-9c4e-4a23-88e3-3547971296e5', {
      name: 'My new dashboard',
      type: DASHBOARD_TYPE.MAIN,
      position: 0,
      visibility: DASHBOARD_VISIBILITY.PRIVATE,
      boxes: [
        [
          {
            type: DASHBOARD_BOX_TYPE.USER_PRESENCE,
          },
        ],
      ],
    });
    expect(newDashboard).to.have.property('name', 'My new dashboard');
    expect(newDashboard).to.have.property('selector', 'my-new-dashboard');
    // a private dashboard notifies only its owner's devices
    sinonAssert.calledWith(event.emit, EVENTS.WEBSOCKET.SEND, {
      type: WEBSOCKET_MESSAGE_TYPES.DASHBOARD.CREATED,
      userId: '0cd30aef-9c4e-4a23-88e3-3547971296e5',
      payload: { selector: 'my-new-dashboard' },
    });
  });
  it('should return error, missing box type', async () => {
    const promise = dashboard.create('0cd30aef-9c4e-4a23-88e3-3547971296e5', {
      name: 'My new dashboard',
      type: DASHBOARD_TYPE.MAIN,
      boxes: [[{}]],
    });
    return assert.isRejected(promise);
  });
});
