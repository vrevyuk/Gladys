import { Component } from 'preact';
import { Text } from 'preact-i18n';
import { connect } from 'unistore/preact';
import cx from 'classnames';

import BeokLocalPage from './BeokLocalPage';
import DeviceCard from './DeviceCard';

const isValidIp = value => {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};
const isValidMac = value => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value);
const asDeviceList = result => (Array.isArray(result) ? result : [result]).filter(Boolean);

class DiscoverPage extends Component {
  state = {
    devices: [],
    housesWithRooms: [],
    ip: '',
    mac: '',
    loading: false,
    error: false,
    validationError: false
  };

  async componentWillMount() {
    try {
      const housesWithRooms = await this.props.httpClient.get('/api/v1/house', { expand: 'rooms' });
      this.setState({ housesWithRooms });
    } catch (e) {
      this.setState({ error: true });
    }
  }

  setIp = event => this.setState({ ip: event.target.value });
  setMac = event => this.setState({ mac: event.target.value });

  requestDevices = async (endpoint, body) => {
    this.setState({ loading: true, error: false, validationError: false });
    try {
      const result = await this.props.httpClient.post(`/api/v1/service/beok-local/${endpoint}`, body);
      this.setState({ devices: asDeviceList(result), loading: false });
    } catch (e) {
      this.setState({ loading: false, error: true });
    }
  };

  discover = () => this.requestDevices('discover');

  probe = () => {
    const { ip, mac } = this.state;
    if (!isValidIp(ip) || !isValidMac(mac)) {
      this.setState({ validationError: true, error: false });
      return;
    }
    this.requestDevices('probe', { address: ip, mac });
  };

  updateDevice = (index, savedDevice) => {
    const devices = [...this.state.devices];
    devices[index] = savedDevice;
    this.setState({ devices });
  };

  render(props, { devices, housesWithRooms, ip, mac, loading, error, validationError }) {
    return (
      <BeokLocalPage>
        <div class="card">
          <div class="card-header">
            <h1 class="card-title">
              <Text id="integration.beok-local.discover.title" />
            </h1>
            <div class="page-options">
              <button class="btn btn-outline-primary" disabled={loading} onClick={this.discover}>
                <Text id="integration.beok-local.discover.scan" /> <i class="fe fe-radio" />
              </button>
            </div>
          </div>
          <div class="card-body">
            <div class="alert alert-secondary">
              <Text id="integration.beok-local.discover.description" />
            </div>
            {error && (
              <div class="alert alert-danger">
                <Text id="integration.beok-local.errors.discover" />
              </div>
            )}
            {validationError && (
              <div class="alert alert-danger">
                <Text id="integration.beok-local.discover.validation" />
              </div>
            )}
            <div class="card bg-light mb-4">
              <div class="card-body">
                <h4>
                  <Text id="integration.beok-local.discover.manualTitle" />
                </h4>
                <div class="form-row align-items-end">
                  <div class="form-group col-md-5">
                    <label class="form-label">
                      <Text id="integration.beok-local.device.ip" />
                    </label>
                    <input class="form-control" value={ip} onInput={this.setIp} placeholder="192.168.1.50" />
                  </div>
                  <div class="form-group col-md-5">
                    <label class="form-label">
                      <Text id="integration.beok-local.device.mac" />
                    </label>
                    <input class="form-control" value={mac} onInput={this.setMac} placeholder="AA:BB:CC:DD:EE:FF" />
                  </div>
                  <div class="form-group col-md-2">
                    <button class="btn btn-primary btn-block" disabled={loading} onClick={this.probe}>
                      <Text id="integration.beok-local.discover.probe" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class={cx('dimmer', { active: loading })}>
              <div class="loader" />
              <div class="dimmer-content">
                {devices.length === 0 && !loading && (
                  <p class="text-center text-muted">
                    <Text id="integration.beok-local.discover.empty" />
                  </p>
                )}
                <div class="row">
                  {devices.map((device, index) => (
                    <DeviceCard
                      device={device}
                      housesWithRooms={housesWithRooms}
                      httpClient={props.httpClient}
                      onSaved={savedDevice => this.updateDevice(index, savedDevice)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BeokLocalPage>
    );
  }
}

export default connect('httpClient', {})(DiscoverPage);
