const { assert } = require('chai');

const numericType = require('../../../../services/zigbee2mqtt/exposes/numericType');
const {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} = require('../../../../utils/constants');

describe('zigbee2mqtt numericType', () => {
  it('should write value', () => {
    const expose = {};
    const result = numericType.writeValue(expose, 17);
    assert.equal(result, 17);
  });

  it('should read value', () => {
    const expose = {};
    const result = numericType.readValue(expose, 17);
    assert.equal(result, 17);
  });

  it('should read linkquality value', () => {
    const expose = { name: 'linkquality' };
    const result = numericType.readValue(expose, 102);
    assert.equal(result, 2);
  });

  it('should map numeric carbon_monoxide values to a CO sensor', () => {
    assert.deepEqual(numericType.names.carbon_monoxide.feature, {
      category: DEVICE_FEATURE_CATEGORIES.CO_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
      unit: DEVICE_FEATURE_UNITS.PPM,
    });
  });
});
