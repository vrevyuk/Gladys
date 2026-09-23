import { Component } from 'preact';
import { Text } from 'preact-i18n';
import { Link } from 'preact-router/match';
import cx from 'classnames';

const normalizeMac = mac => (typeof mac === 'string' ? mac.replace(/[:-]/g, '').toLowerCase() : '');

const getParam = (device, name) => {
  const param = (device.params || []).find(item => item.name === name);
  return param && param.value;
};

class DeviceCard extends Component {
  state = {
    device: this.props.device
  };

  componentWillReceiveProps(nextProps) {
    if (nextProps.device !== this.props.device) {
      this.setState({ device: nextProps.device });
    }
  }

  updateName = event => {
    this.setState({ device: { ...this.state.device, name: event.target.value } });
  };

  updateRoom = event => {
    this.setState({ device: { ...this.state.device, room_id: event.target.value || null } });
  };

  save = async () => {
    this.setState({ loading: true, error: false, success: false });
    try {
      const savedDevice = await this.props.httpClient.post('/api/v1/device', this.state.device);
      this.setState({ device: savedDevice, success: true });
      if (this.props.onSaved) {
        this.props.onSaved(savedDevice);
      }
    } catch (e) {
      this.setState({ error: true });
    }
    this.setState({ loading: false });
  };

  delete = async () => {
    this.setState({ loading: true, error: false, success: false });
    try {
      await this.props.httpClient.delete(`/api/v1/device/${encodeURIComponent(this.state.device.selector)}`);
      if (this.props.onDeleted) {
        this.props.onDeleted(this.state.device);
      }
    } catch (e) {
      this.setState({ loading: false, error: true });
    }
  };

  render(props, { device, loading, error, success }) {
    const ip = getParam(device, 'IP_ADDRESS');
    const mac = getParam(device, 'MAC_ADDRESS');
    const normalizedMac = normalizeMac(mac);
    const persisted = Boolean(device.selector && device.created_at);

    return (
      <div class="col-md-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">{device.name}</h3>
          </div>
          <div class={cx('dimmer', { active: loading })}>
            <div class="loader" />
            <div class="dimmer-content card-body">
              {error && (
                <div class="alert alert-danger">
                  <Text id="integration.beok-local.errors.save" />
                </div>
              )}
              {success && (
                <div class="alert alert-success">
                  <Text id="integration.beok-local.device.saved" />
                </div>
              )}
              <div class="form-group">
                <label class="form-label">
                  <Text id="integration.beok-local.device.name" />
                </label>
                <input class="form-control" value={device.name} onInput={this.updateName} />
              </div>
              <div class="form-group">
                <label class="form-label">
                  <Text id="integration.beok-local.device.room" />
                </label>
                <select class="form-control" value={device.room_id || ''} onChange={this.updateRoom}>
                  <option value="">
                    <Text id="global.emptySelectOption" />
                  </option>
                  {props.housesWithRooms.map(house => (
                    <optgroup label={house.name}>
                      {house.rooms.map(room => (
                        <option value={room.id}>{room.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {ip && (
                <div class="form-group">
                  <label class="form-label">
                    <Text id="integration.beok-local.device.ip" />
                  </label>
                  <input class="form-control" value={ip} disabled />
                </div>
              )}
              {mac && (
                <div class="form-group">
                  <label class="form-label">
                    <Text id="integration.beok-local.device.mac" />
                  </label>
                  <input class="form-control" value={mac} disabled />
                </div>
              )}
              <div class="d-flex flex-wrap justify-content-between">
                <button class="btn btn-primary mb-2" disabled={loading || !device.name} onClick={this.save}>
                  <Text id="global.save" />
                </button>
                {persisted && normalizedMac && (
                  <Link
                    class="btn btn-outline-primary mb-2"
                    href={`/dashboard/integration/device/beok-local/schedule/${normalizedMac}`}
                  >
                    <Text id="integration.beok-local.schedule.button" />
                  </Link>
                )}
                {persisted && props.allowDelete && (
                  <button class="btn btn-outline-danger mb-2" disabled={loading} onClick={this.delete}>
                    <Text id="global.delete" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

DeviceCard.defaultProps = {
  housesWithRooms: []
};

export default DeviceCard;
