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

describe('dashboard.update', () => {
  const event = { emit: fake.returns(null) };
  const dashboard = new Dashboard(event);
  it('should update a dashoard', async () => {
    const updatedDashboard = await dashboard.update('0cd30aef-9c4e-4a23-88e3-3547971296e5', 'test-dashboard', {
      name: 'New name',
    });
    expect(updatedDashboard).to.have.property('name', 'New name');
    expect(updatedDashboard).to.have.property('selector', 'test-dashboard');
    // a private dashboard notifies only its owner's devices
    sinonAssert.calledWith(event.emit, EVENTS.WEBSOCKET.SEND, {
      type: WEBSOCKET_MESSAGE_TYPES.DASHBOARD.UPDATED,
      userId: '0cd30aef-9c4e-4a23-88e3-3547971296e5',
      payload: { selector: 'test-dashboard' },
    });
  });
  it('should update a public dashboard (not created by me)', async () => {
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
    const updatedDashboard = await dashboard.update('0cd30aef-9c4e-4a23-88e3-3547971296e5', publicDashboard.selector, {
      name: 'New name',
    });
    expect(updatedDashboard).to.have.property('name', 'New name');
    expect(updatedDashboard).to.have.property('selector', publicDashboard.selector);
    // a public dashboard is visible to everyone, so all connected sessions are notified
    sinonAssert.calledWith(event.emit, EVENTS.WEBSOCKET.SEND_ALL, {
      type: WEBSOCKET_MESSAGE_TYPES.DASHBOARD.UPDATED,
      payload: { selector: publicDashboard.selector },
    });
  });

  it('should return not found', async () => {
    const promise = dashboard.update('0cd30aef-9c4e-4a23-88e3-3547971296e5', 'not-found-dashboard', {
      name: 'new name',
    });
    return assert.isRejected(promise, 'Dashboard not found');
  });
});
