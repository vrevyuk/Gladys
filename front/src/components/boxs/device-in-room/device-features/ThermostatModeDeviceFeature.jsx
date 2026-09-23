import get from 'get-value';
import { Text } from 'preact-i18n';
import cx from 'classnames';

import { DeviceFeatureCategoriesIcon } from '../../../../utils/consts';
import { THERMOSTAT_MODE } from '../../../../../../server/utils/constants';

const ThermostatModeDeviceFeature = props => {
  const { deviceFeature } = props;
  const { category, type, last_value: lastValue } = deviceFeature;
  const updateValue = value => props.updateValueWithDebounce(deviceFeature, value);

  return (
    <tr>
      <td>
        <i class={`fe fe-${get(DeviceFeatureCategoriesIcon, `${category}.${type}`, { default: 'sliders' })}`} />
      </td>
      <td>{props.rowName}</td>
      <td class="py-0">
        <div class="d-flex justify-content-end">
          <div class="btn-group" role="group">
            <button
              class={cx('btn btn-sm btn-secondary', { active: lastValue === THERMOSTAT_MODE.MANUAL })}
              onClick={() => updateValue(THERMOSTAT_MODE.MANUAL)}
            >
              <Text id={`deviceFeatureAction.category.${category}.${type}.manual`} />
            </button>
            <button
              class={cx('btn btn-sm btn-secondary', { active: lastValue === THERMOSTAT_MODE.PROGRAM })}
              onClick={() => updateValue(THERMOSTAT_MODE.PROGRAM)}
            >
              <Text id={`deviceFeatureAction.category.${category}.${type}.program`} />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
};

export default ThermostatModeDeviceFeature;
