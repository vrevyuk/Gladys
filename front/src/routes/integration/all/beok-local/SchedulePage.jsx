import { Component } from 'preact';
import { Text } from 'preact-i18n';
import { connect } from 'unistore/preact';
import cx from 'classnames';

import { THERMOSTAT_MODE } from '../../../../../../server/utils/constants';
import BeokLocalPage from './BeokLocalPage';

const DEFAULT_WEEKDAY = [
  { time: '06:00', temperature: 20 },
  { time: '08:00', temperature: 16 },
  { time: '11:30', temperature: 16 },
  { time: '12:30', temperature: 16 },
  { time: '17:00', temperature: 20 },
  { time: '22:00', temperature: 16 }
];
const DEFAULT_WEEKEND = [
  { time: '08:00', temperature: 20 },
  { time: '23:00', temperature: 16 }
];

const normalizeRows = (rows, defaults) =>
  defaults.map((defaultRow, index) => {
    const row = (rows || [])[index] || {};
    const time =
      row.time ||
      (Number.isInteger(row.startHour) && Number.isInteger(row.startMinute)
        ? `${String(row.startHour).padStart(2, '0')}:${String(row.startMinute).padStart(2, '0')}`
        : defaultRow.time);
    return {
      time,
      temperature:
        row.temperature === undefined ? (row.temp === undefined ? defaultRow.temperature : row.temp) : row.temperature
    };
  });

const normalizeSchedule = response => {
  const schedule = response.schedule || response;
  return {
    mode: schedule.mode === undefined ? THERMOSTAT_MODE.PROGRAM : Number(schedule.mode),
    dayGrouping: schedule.dayGrouping || '5+2',
    weekday: normalizeRows(schedule.weekday, DEFAULT_WEEKDAY),
    weekend: normalizeRows(schedule.weekend, DEFAULT_WEEKEND)
  };
};

const validRows = rows => {
  let previousMinutes = -1;
  return rows.every(row => {
    const timeIsValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(row.time);
    const [hour, minute] = timeIsValid ? row.time.split(':').map(Number) : [0, 0];
    const minutes = hour * 60 + minute;
    const temperature = Number(row.temperature);
    const valid =
      timeIsValid &&
      minutes > previousMinutes &&
      temperature >= 5 &&
      temperature <= 35 &&
      temperature * 2 === Math.round(temperature * 2);
    previousMinutes = minutes;
    return valid;
  });
};

const serializeRows = rows =>
  rows.map(row => {
    const [startHour, startMinute] = row.time.split(':').map(Number);
    return { startHour, startMinute, temp: Number(row.temperature) };
  });

class SchedulePage extends Component {
  state = {
    schedule: normalizeSchedule({}),
    loading: true,
    error: false,
    success: false,
    validationError: false
  };

  async componentWillMount() {
    try {
      const response = await this.props.httpClient.get(`/api/v1/service/beok-local/device/${this.props.mac}/schedule`);
      this.setState({ schedule: normalizeSchedule(response), loading: false });
    } catch (e) {
      this.setState({ loading: false, error: true });
    }
  }

  updateSchedule = (property, value) => {
    this.setState({ schedule: { ...this.state.schedule, [property]: value }, success: false });
  };

  updateRow = (group, index, property, value) => {
    const rows = [...this.state.schedule[group]];
    rows[index] = { ...rows[index], [property]: property === 'temperature' ? Number(value) : value };
    this.updateSchedule(group, rows);
  };

  save = async () => {
    const { schedule } = this.state;
    if (!validRows(schedule.weekday) || !validRows(schedule.weekend)) {
      this.setState({ validationError: true, success: false });
      return;
    }
    this.setState({ loading: true, error: false, success: false, validationError: false });
    try {
      const response = await this.props.httpClient.put(`/api/v1/service/beok-local/device/${this.props.mac}/schedule`, {
        mode: schedule.mode,
        dayGrouping: schedule.dayGrouping,
        weekday: serializeRows(schedule.weekday),
        weekend: serializeRows(schedule.weekend)
      });
      this.setState({
        schedule: normalizeSchedule({ ...schedule, ...(response || {}) }),
        loading: false,
        success: true
      });
    } catch (e) {
      this.setState({ loading: false, error: true });
    }
  };

  renderRows = (group, rows) =>
    rows.map((row, index) => (
      <tr>
        <td>
          <Text id="integration.beok-local.schedule.period" fields={{ number: index + 1 }} />
        </td>
        <td>
          <input
            type="time"
            class="form-control"
            value={row.time}
            onInput={event => this.updateRow(group, index, 'time', event.target.value)}
          />
        </td>
        <td>
          <div class="input-group">
            <input
              type="number"
              min="5"
              max="35"
              step="0.5"
              class="form-control"
              value={row.temperature}
              onInput={event => this.updateRow(group, index, 'temperature', event.target.value)}
            />
            <div class="input-group-append">
              <span class="input-group-text">°C</span>
            </div>
          </div>
        </td>
      </tr>
    ));

  render(props, { schedule, loading, error, success, validationError }) {
    return (
      <BeokLocalPage>
        <div class="card">
          <div class="card-header">
            <h1 class="card-title">
              <Text id="integration.beok-local.schedule.title" />
            </h1>
          </div>
          <div class={cx('dimmer', { active: loading })}>
            <div class="loader" />
            <div class="dimmer-content card-body">
              <div class="alert alert-warning">
                <Text id="integration.beok-local.schedule.manualWarning" />
              </div>
              {error && (
                <div class="alert alert-danger">
                  <Text id="integration.beok-local.errors.schedule" />
                </div>
              )}
              {validationError && (
                <div class="alert alert-danger">
                  <Text id="integration.beok-local.schedule.validation" />
                </div>
              )}
              {success && (
                <div class="alert alert-success">
                  <Text id="integration.beok-local.schedule.saved" />
                </div>
              )}
              <div class="form-row">
                <div class="form-group col-md-6">
                  <label class="form-label">
                    <Text id="integration.beok-local.schedule.mode" />
                  </label>
                  <select
                    class="form-control"
                    value={schedule.mode}
                    onChange={event => this.updateSchedule('mode', Number(event.target.value))}
                  >
                    <option value={THERMOSTAT_MODE.MANUAL}>
                      <Text id="integration.beok-local.schedule.manual" />
                    </option>
                    <option value={THERMOSTAT_MODE.PROGRAM}>
                      <Text id="integration.beok-local.schedule.program" />
                    </option>
                  </select>
                </div>
                <div class="form-group col-md-6">
                  <label class="form-label">
                    <Text id="integration.beok-local.schedule.dayGrouping" />
                  </label>
                  <select
                    class="form-control"
                    value={schedule.dayGrouping}
                    onChange={event => this.updateSchedule('dayGrouping', event.target.value)}
                  >
                    <option value="5+2">5+2</option>
                    <option value="6+1">6+1</option>
                    <option value="7+0">7+0</option>
                  </select>
                </div>
              </div>
              <h4>
                <Text id="integration.beok-local.schedule.weekday" />
              </h4>
              <div class="table-responsive mb-4">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>
                        <Text id="integration.beok-local.schedule.periodLabel" />
                      </th>
                      <th>
                        <Text id="integration.beok-local.schedule.time" />
                      </th>
                      <th>
                        <Text id="integration.beok-local.schedule.temperature" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>{this.renderRows('weekday', schedule.weekday)}</tbody>
                </table>
              </div>
              <h4>
                <Text id="integration.beok-local.schedule.weekend" />
              </h4>
              <div class="table-responsive mb-4">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>
                        <Text id="integration.beok-local.schedule.periodLabel" />
                      </th>
                      <th>
                        <Text id="integration.beok-local.schedule.time" />
                      </th>
                      <th>
                        <Text id="integration.beok-local.schedule.temperature" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>{this.renderRows('weekend', schedule.weekend)}</tbody>
                </table>
              </div>
              <button class="btn btn-primary" disabled={loading} onClick={this.save}>
                <Text id="global.save" />
              </button>
            </div>
          </div>
        </div>
      </BeokLocalPage>
    );
  }
}

export default connect('httpClient', {})(SchedulePage);
