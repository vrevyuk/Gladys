const { create } = require('./dashboard.create');
const { get } = require('./dashboard.get');
const { destroy } = require('./dashboard.destroy');
const { getBySelector } = require('./dashboard.getBySelector');
const { update } = require('./dashboard.update');
const { updateOrder } = require('./dashboard.updateOrder');
const { emitWebsocketEvent } = require('./dashboard.emitWebsocketEvent');

const Dashboard = function Dashboard(event) {
  this.event = event;
};

Dashboard.prototype.create = create;
Dashboard.prototype.destroy = destroy;
Dashboard.prototype.get = get;
Dashboard.prototype.getBySelector = getBySelector;
Dashboard.prototype.update = update;
Dashboard.prototype.updateOrder = updateOrder;
Dashboard.prototype.emitWebsocketEvent = emitWebsocketEvent;

module.exports = Dashboard;
