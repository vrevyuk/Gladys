const DEVICE_PARAM_NAME = {
  IP_ADDRESS: 'IP_ADDRESS',
  PORT: 'PORT',
  PASSWORD: 'PASSWORD',
};

const DEFAULT_PORT = '2323';
const DEFAULT_TIMEOUT = 4000;
const EXTERNAL_ID_PREFIX = 'fully-kiosk';

// Fully Remote Admin REST command names.
const FULLY_COMMANDS = {
  SCREEN_ON: 'screenOn',
  SCREEN_OFF: 'screenOff',
  SET_STRING_SETTING: 'setStringSetting',
  LOAD_URL: 'loadUrl',
  TEXT_TO_SPEECH: 'textToSpeech',
  DEVICE_INFO: 'deviceInfo',
};

module.exports = {
  DEVICE_PARAM_NAME,
  DEFAULT_PORT,
  DEFAULT_TIMEOUT,
  EXTERNAL_ID_PREFIX,
  FULLY_COMMANDS,
};
