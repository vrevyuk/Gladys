import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text } from 'preact-i18n';
import { Link } from 'preact-router/match';
import dayjs from 'dayjs';
import cx from 'classnames';
import get from 'get-value';

import actions from '../../../actions/dashboard/boxes/calendar';
import { describeEventTime } from './computeUpcoming';
import { RequestStatus, DASHBOARD_BOX_DATA_KEY, DASHBOARD_BOX_STATUS_KEY } from '../../../utils/consts';
import style from './style.css';

const BOX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CALENDAR_ROUTE = '/dashboard/calendar';
const DEFAULT_COLOR = '#3174ad';

function toEventView(event, now, language) {
  const desc = describeEventTime(event, now);
  let dayLabel = null;
  if (!desc.ongoing && !desc.startsToday && !desc.startsTomorrow) {
    dayLabel = dayjs(event.start)
      .locale(language)
      .format('ddd D MMM');
  }
  return {
    name: event.name,
    color: event.color || DEFAULT_COLOR,
    ongoing: desc.ongoing,
    allDay: desc.allDay,
    startsTomorrow: desc.startsTomorrow && !desc.ongoing,
    dayLabel,
    time: desc.time
  };
}

const EventTime = ({ view }) => {
  if (view.ongoing) {
    return <Text id="dashboard.boxes.calendar.now" />;
  }
  if (view.allDay) {
    return (
      <span>
        {view.startsTomorrow && (
          <span class={style.eventDay}>
            <Text id="dashboard.boxes.calendar.tomorrow" />{' '}
          </span>
        )}
        {view.dayLabel && <span class={style.eventDay}>{view.dayLabel} </span>}
        <Text id="dashboard.boxes.calendar.allDay" />
      </span>
    );
  }
  return (
    <span>
      {view.startsTomorrow && (
        <span class={style.eventDay}>
          <Text id="dashboard.boxes.calendar.tomorrow" />{' '}
        </span>
      )}
      {view.dayLabel && <span class={style.eventDay}>{view.dayLabel} </span>}
      {view.time}
    </span>
  );
};

const EventRow = ({ view, large }) => (
  <div class={cx(style.eventRow, { [style.eventRowLarge]: large })}>
    <span class={style.eventDot} style={{ backgroundColor: view.color }} />
    <span class={style.eventTime}>
      <EventTime view={view} />
    </span>
    <span class={style.eventName}>{view.name}</span>
  </div>
);

const CalendarBox = ({ boxTitle, boxStatus, status, nextView, todayViews, moreCount }) => (
  <div class="card">
    <div class="card-header">
      <Link href={CALENDAR_ROUTE} class="card-title">
        {boxTitle || <Text id="dashboard.boxTitle.calendar" />}
      </Link>
    </div>
    <div class="card-body">
      {boxStatus === RequestStatus.Error && (
        <p class="alert alert-danger">
          <Text id="dashboard.boxes.calendar.error" />
        </p>
      )}
      {boxStatus !== RequestStatus.Error && status === 'empty' && (
        <p class="text-muted mb-0">
          <Text id="dashboard.boxes.calendar.noUpcomingEvents" />
        </p>
      )}
      {boxStatus !== RequestStatus.Error && status === 'ok' && (
        <div>
          <div class={style.sectionLabel}>
            <Text id="dashboard.boxes.calendar.next" />
          </div>
          {nextView && <EventRow view={nextView} large />}
          <div class={style.sectionLabel}>
            <Text id="dashboard.boxes.calendar.today" />
          </div>
          {todayViews.length === 0 && (
            <p class="text-muted mb-0">
              <Text id="dashboard.boxes.calendar.noMoreEventsToday" />
            </p>
          )}
          {todayViews.map(view => (
            <EventRow view={view} />
          ))}
          {moreCount > 0 && (
            <Link href={CALENDAR_ROUTE} class={style.moreLink}>
              <Text id="dashboard.boxes.calendar.moreEvents" fields={{ count: moreCount }} />
            </Link>
          )}
        </div>
      )}
    </div>
  </div>
);

class CalendarBoxComponent extends Component {
  refreshData = () => {
    this.props.getCalendarEvents(this.props.box, this.props.x, this.props.y);
  };

  componentDidMount() {
    this.refreshData();
    this.interval = setInterval(this.refreshData, BOX_REFRESH_INTERVAL_MS);
  }

  componentDidUpdate(previousProps) {
    if (get(previousProps, 'box.calendar_max_events') !== get(this.props, 'box.calendar_max_events')) {
      this.refreshData();
    }
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render(props) {
    const boxData = get(props, `${DASHBOARD_BOX_DATA_KEY}Calendar.${props.x}_${props.y}`);
    const boxStatus = get(props, `${DASHBOARD_BOX_STATUS_KEY}Calendar.${props.x}_${props.y}`);
    const upcoming = get(boxData, 'upcoming');
    const language = get(props, 'user.language');
    const now = new Date();

    const nextEvent = get(upcoming, 'next');
    const nextView = nextEvent ? toEventView(nextEvent, now, language) : null;
    const todayViews = (get(upcoming, 'today') || []).map(event => toEventView(event, now, language));

    return (
      <CalendarBox
        boxTitle={props.box.title}
        boxStatus={boxStatus}
        status={get(upcoming, 'status')}
        nextView={nextView}
        todayViews={todayViews}
        moreCount={get(upcoming, 'moreCount') || 0}
      />
    );
  }
}

export default connect('DashboardBoxDataCalendar,DashboardBoxStatusCalendar,user', actions)(CalendarBoxComponent);
