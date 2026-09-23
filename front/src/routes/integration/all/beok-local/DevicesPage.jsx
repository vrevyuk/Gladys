import { Component } from 'preact';
import { Text } from 'preact-i18n';
import { connect } from 'unistore/preact';
import cx from 'classnames';

import BeokLocalPage from './BeokLocalPage';
import DeviceCard from './DeviceCard';

class DevicesPage extends Component {
  state = {
    devices: [],
    housesWithRooms: [],
    loading: true,
    error: false
  };

  async componentWillMount() {
    try {
      const [devices, housesWithRooms] = await Promise.all([
        this.props.httpClient.get('/api/v1/service/beok-local/device'),
        this.props.httpClient.get('/api/v1/house', { expand: 'rooms' })
      ]);
      this.setState({ devices, housesWithRooms, loading: false });
    } catch (e) {
      this.setState({ loading: false, error: true });
    }
  }

  updateDevice = (index, savedDevice) => {
    const devices = [...this.state.devices];
    devices[index] = savedDevice;
    this.setState({ devices });
  };

  deleteDevice = index => {
    this.setState({ devices: this.state.devices.filter((device, deviceIndex) => deviceIndex !== index) });
  };

  render(props, { devices, housesWithRooms, loading, error }) {
    return (
      <BeokLocalPage>
        <div class="card">
          <div class="card-header">
            <h1 class="card-title">
              <Text id="integration.beok-local.devices.title" />
            </h1>
          </div>
          <div class="card-body">
            {error && (
              <div class="alert alert-danger">
                <Text id="integration.beok-local.errors.load" />
              </div>
            )}
            <div class={cx('dimmer', { active: loading })}>
              <div class="loader" />
              <div class="dimmer-content">
                {devices.length === 0 && !loading && (
                  <div class="text-center text-muted">
                    <i class="fe fe-thermometer fe-3x mb-3" />
                    <p>
                      <Text id="integration.beok-local.devices.empty" />
                    </p>
                  </div>
                )}
                <div class="row">
                  {devices.map((device, index) => (
                    <DeviceCard
                      device={device}
                      housesWithRooms={housesWithRooms}
                      httpClient={props.httpClient}
                      allowDelete
                      onSaved={savedDevice => this.updateDevice(index, savedDevice)}
                      onDeleted={() => this.deleteDevice(index)}
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

export default connect('httpClient', {})(DevicesPage);
