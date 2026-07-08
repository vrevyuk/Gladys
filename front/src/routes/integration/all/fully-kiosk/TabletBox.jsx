import { Text, Localizer } from 'preact-i18n';
import { Component } from 'preact';
import cx from 'classnames';
import style from './style.css';

class TabletBox extends Component {
  getParam = name => {
    const param = this.props.tablet.params.find(p => p.name === name);
    return param ? param.value : '';
  };

  updateName = e => this.props.updateTabletField(this.props.tabletIndex, 'name', e.target.value);
  updateIp = e => this.props.updateTabletParam(this.props.tabletIndex, 'IP_ADDRESS', e.target.value);
  updatePort = e => this.props.updateTabletParam(this.props.tabletIndex, 'PORT', e.target.value);
  updatePassword = e => this.props.updateTabletParam(this.props.tabletIndex, 'PASSWORD', e.target.value);

  save = () => this.props.saveTablet(this.props.tabletIndex);
  remove = () => this.props.deleteTablet(this.props.tabletIndex);
  test = () => this.props.testConnection(this.props.tabletIndex);

  render({ tablet }) {
    const result = tablet.testResult;
    return (
      <div class={cx('card', style['fully-kiosk-tablet-card'])}>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.nameLabel" />
            </label>
            <Localizer>
              <input
                type="text"
                class="form-control"
                value={tablet.name || ''}
                onInput={this.updateName}
                placeholder={<Text id="integration.fully-kiosk.namePlaceholder" />}
              />
            </Localizer>
          </div>
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.ipLabel" />
            </label>
            <Localizer>
              <input
                type="text"
                class="form-control"
                value={this.getParam('IP_ADDRESS') || ''}
                onInput={this.updateIp}
                placeholder={<Text id="integration.fully-kiosk.ipPlaceholder" />}
              />
            </Localizer>
          </div>
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.portLabel" />
            </label>
            <input type="text" class="form-control" value={this.getParam('PORT') || '2323'} onInput={this.updatePort} />
          </div>
          <div class="form-group">
            <label class="form-label">
              <Text id="integration.fully-kiosk.passwordLabel" />
            </label>
            <input
              type="password"
              class="form-control"
              value={this.getParam('PASSWORD') || ''}
              onInput={this.updatePassword}
            />
          </div>
          {result && result.success && (
            <div class="alert alert-success">
              <Text
                id="integration.fully-kiosk.testSuccess"
                fields={{ deviceName: result.deviceName, batteryLevel: result.batteryLevel }}
              />
            </div>
          )}
          {result && !result.success && (
            <div class="alert alert-danger">
              <Text id="integration.fully-kiosk.testFailure" fields={{ message: result.message }} />
            </div>
          )}
          <div class="btn-list">
            <button class="btn btn-outline-primary" onClick={this.test}>
              <Text id="integration.fully-kiosk.testConnection" />
            </button>
            <button class="btn btn-success" onClick={this.save}>
              <Text id="integration.fully-kiosk.saveButton" />
            </button>
            <button class="btn btn-outline-danger" onClick={this.remove}>
              <Text id="integration.fully-kiosk.deleteButton" />
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default TabletBox;
