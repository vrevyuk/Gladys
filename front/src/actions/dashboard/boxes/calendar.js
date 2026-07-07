import dayjs from 'dayjs';
import get from 'get-value';
import { RequestStatus } from '../../../utils/consts';
import createBoxActions from '../boxActions';
import { computeUpcoming } from '../../../components/boxs/calendar/computeUpcoming';

const BOX_KEY = 'Calendar';
const LOOKAHEAD_DAYS = 31;

function createActions(store) {
  const boxActions = createBoxActions(store);

  const actions = {
    async getCalendarEvents(state, box, x, y) {
      boxActions.updateBoxStatus(state, BOX_KEY, x, y, RequestStatus.Getting);
      try {
        const now = dayjs();
        const from = now.startOf('day').toISOString();
        const to = now.add(LOOKAHEAD_DAYS, 'day').toISOString();

        const events = await state.httpClient.get('/api/v1/calendar/event', {
          from,
          to,
          shared: true
        });
        const calendars = await state.httpClient.get('/api/v1/calendar');
        const colorByCalendarId = {};
        calendars.forEach(calendar => {
          colorByCalendarId[calendar.id] = calendar.color;
        });
        const eventsWithColor = events.map(event => ({
          ...event,
          color: colorByCalendarId[event.calendar_id]
        }));

        const maxToday = get(box, 'calendar_max_events') || undefined;
        const upcoming = computeUpcoming(eventsWithColor, now.toDate(), { maxToday });

        boxActions.mergeBoxData(state, BOX_KEY, x, y, { upcoming });
        boxActions.updateBoxStatus(state, BOX_KEY, x, y, RequestStatus.Success);
      } catch (e) {
        console.error(e);
        boxActions.updateBoxStatus(state, BOX_KEY, x, y, RequestStatus.Error);
      }
    }
  };
  return Object.assign({}, actions);
}

export default createActions;
