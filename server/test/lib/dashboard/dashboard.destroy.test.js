const { assert } = require('chai');
const { fake, assert: sinonAssert } = require('sinon');
const {
  DASHBOARD_BOX_TYPE,
  DASHBOARD_TYPE,
  DASHBOARD_VISIBILITY,
  EVENTS,
  WEBSOCKET_MESSAGE_TYPES,
} = require('../../../utils/constants');

const Dashboard = require('../../../lib/dashboard');

describe('dashboard.destroy', () => {
  const event = { emit: fake.returns(null) };
  const dashboard = new Dashboard(event);
  it('should destroy a dashoard', async () => {
    await dashboard.destroy('0cd30aef-9c4e-4a23-88e3-3547971296e5', 'test-dashboard');
    // a private dashboard notifies only its owner's devices
    sinonAssert.calledWith(event.emit, EVENTS.WEBSOCKET.SEND, {
      type: WEBSOCKET_MESSAGE_TYPES.DASHBOARD.DELETED,
      userId: '0cd30aef-9c4e-4a23-88e3-3547971296e5',
      payload: { selector: 'test-dashboard' },
    });
  });
  it('should destroy a public dashoard', async () => {
    const publicDashboard = await dashboard.create('7a137a56-069e-4996-8816-36558174b727', {
      name: 'My new public dashboard',
      selector: 'my-new-public-dashoard',
      type: DASHBOARD_TYPE.MAIN,
      visibility: DASHBOARD_VISIBILITY.PUBLIC,
      position: 0,
      boxes: [
        [
          {
            type: DASHBOARD_BOX_TYPE.USER_PRESENCE,
          },
        ],
      ],
    });
    await dashboard.destroy('0cd30aef-9c4e-4a23-88e3-3547971296e5', publicDashboard.selector);
  });
  it('should return not found', async () => {
    const promise = dashboard.destroy('0cd30aef-9c4e-4a23-88e3-3547971296e5', 'not-found-dashboard');
    return assert.isRejected(promise, 'Dashboard not found');
  });
});
