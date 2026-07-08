import { RequestStatus } from '../../../../utils/consts';
import update from 'immutability-helper';
import uuid from 'uuid';
import {
  DEVICE_POLL_FREQUENCIES,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS
} from '../../../../../../server/utils/constants';
import createActionsIntegration from '../../../../actions/integration';

function createActions(store) {
  const integrationActions = createActionsIntegration(store);

  const buildTabletFeatures = baseId => [
    {
      name: 'Screen',
      selector: `${baseId}:screen`,
      external_id: `${baseId}:screen`,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      keep_history: true,
      has_feedback: false,
      min: 0,
      max: 1
    },
    {
      name: 'Brightness',
      selector: `${baseId}:brightness`,
      external_id: `${baseId}:brightness`,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.DIMMER,
      read_only: false,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 255
    },
    {
      name: 'Battery',
      selector: `${baseId}:battery`,
      external_id: `${baseId}:battery`,
      category: DEVICE_FEATURE_CATEGORIES.BATTERY,
      type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      read_only: true,
      keep_history: true,
      has_feedback: false,
      min: 0,
      max: 100
    },
    {
      name: 'Charging',
      selector: `${baseId}:charging`,
      external_id: `${baseId}:charging`,
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: true,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 1
    },
    {
      name: 'Load URL',
      selector: `${baseId}:load-url`,
      external_id: `${baseId}:load-url`,
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: false,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 0
    },
    {
      name: 'Text to speech',
      selector: `${baseId}:tts`,
      external_id: `${baseId}:tts`,
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: false,
      keep_history: false,
      has_feedback: false,
      min: 0,
      max: 0
    }
  ];

  const actions = {
    async getTablets(state) {
      store.setState({ fullyKioskGetStatus: RequestStatus.Getting });
      try {
        const tablets = await state.httpClient.get('/api/v1/service/fully-kiosk/device');
        store.setState({ fullyKioskTablets: tablets, fullyKioskGetStatus: RequestStatus.Success });
      } catch (e) {
        store.setState({ fullyKioskGetStatus: RequestStatus.Error });
      }
    },
    async addTablet(state) {
      const uniqueId = uuid.v4();
      await integrationActions.getIntegrationByName(state, 'fully-kiosk');
      const newTablet = {
        id: uniqueId,
        name: null,
        should_poll: true,
        poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_30_SECONDS,
        external_id: null,
        service_id: store.getState().currentIntegration.id,
        features: [],
        params: [
          { name: 'IP_ADDRESS', value: null },
          { name: 'PORT', value: '2323' },
          { name: 'PASSWORD', value: null }
        ]
      };
      const fullyKioskTablets = update(state.fullyKioskTablets || [], { $push: [newTablet] });
      store.setState({ fullyKioskTablets });
    },
    updateTabletField(state, index, field, value) {
      const fullyKioskTablets = update(state.fullyKioskTablets, {
        [index]: { [field]: { $set: value } }
      });
      store.setState({ fullyKioskTablets });
    },
    updateTabletParam(state, index, paramName, value) {
      const tablet = state.fullyKioskTablets[index];
      const paramIndex = tablet.params.findIndex(p => p.name === paramName);
      const fullyKioskTablets = update(state.fullyKioskTablets, {
        [index]: { params: { [paramIndex]: { value: { $set: value } } } }
      });
      store.setState({ fullyKioskTablets });
    },
    async saveTablet(state, index) {
      const tablet = { ...state.fullyKioskTablets[index] };
      const ip = tablet.params.find(p => p.name === 'IP_ADDRESS').value;
      const baseId = `fully-kiosk:${ip}`;
      tablet.external_id = baseId;
      tablet.selector = baseId;
      tablet.features = buildTabletFeatures(baseId);
      try {
        const saved = await state.httpClient.post('/api/v1/device', tablet);
        const fullyKioskTablets = update(state.fullyKioskTablets, {
          [index]: { $set: { ...saved, saveError: null } }
        });
        store.setState({ fullyKioskTablets });
      } catch (e) {
        const fullyKioskTablets = update(state.fullyKioskTablets, {
          [index]: { saveError: { $set: e.message } }
        });
        store.setState({ fullyKioskTablets });
      }
    },
    async deleteTablet(state, index) {
      const tablet = state.fullyKioskTablets[index];
      if (tablet.created_at) {
        try {
          await state.httpClient.delete(`/api/v1/device/${tablet.selector}`);
        } catch (e) {
          const fullyKioskTablets = update(state.fullyKioskTablets, {
            [index]: { saveError: { $set: e.message } }
          });
          store.setState({ fullyKioskTablets });
          return;
        }
      }
      const fullyKioskTablets = update(state.fullyKioskTablets, { $splice: [[index, 1]] });
      store.setState({ fullyKioskTablets });
    },
    async testConnection(state, index) {
      const tablet = state.fullyKioskTablets[index];
      let result;
      try {
        result = await state.httpClient.post('/api/v1/service/fully-kiosk/tablet/test', tablet);
      } catch (e) {
        result = { success: false, message: e.message };
      }
      const fullyKioskTablets = update(state.fullyKioskTablets, {
        [index]: { testResult: { $set: result } }
      });
      store.setState({ fullyKioskTablets });
    }
  };
  // Merge the shared integration actions (e.g. getIntegrationByName) with these.
  return Object.assign({}, integrationActions, actions);
}

export default createActions;
