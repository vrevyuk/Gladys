import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text } from 'preact-i18n';
import BaseEditBox from '../baseEditBox';

class EditCalendar extends Component {
  updateMaxEvents = e => {
    this.props.updateBoxConfig(this.props.x, this.props.y, { calendar_max_events: Number(e.target.value) });
  };

  render(props) {
    return (
      <BaseEditBox {...props} titleKey="dashboard.boxTitle.calendar">
        <div class="form-group">
          <label>
            <Text id="dashboard.boxes.calendar.eventsToShowLabel" />
          </label>
          <input
            type="number"
            min="1"
            max="20"
            class="form-control"
            value={props.box.calendar_max_events || 5}
            onInput={this.updateMaxEvents}
          />
        </div>
      </BaseEditBox>
    );
  }
}

export default connect('', {})(EditCalendar);
