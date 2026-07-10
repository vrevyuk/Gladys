const DEVICE_PARAM_NAME = {
  IP_ADDRESS: 'IP_ADDRESS',
  PORT: 'PORT',
  PASSWORD: 'PASSWORD',
};

const DEFAULT_PORT = '2323';
const DEFAULT_TIMEOUT = 4000;
const EXTERNAL_ID_PREFIX = 'fully-kiosk';

// Wait for the HTTP server to listen before asking tablets to reload.
const BOOT_RELOAD_DELAY_MS = 30 * 1000;

// Fully Remote Admin REST command names.
const FULLY_COMMANDS = {
  SCREEN_ON: 'screenOn',
  SCREEN_OFF: 'screenOff',
  SET_STRING_SETTING: 'setStringSetting',
  LOAD_URL: 'loadUrl',
  LOAD_START_URL: 'loadStartURL',
  TEXT_TO_SPEECH: 'textToSpeech',
  DEVICE_INFO: 'deviceInfo',
};

module.exports = {
  DEVICE_PARAM_NAME,
  DEFAULT_PORT,
  DEFAULT_TIMEOUT,
  EXTERNAL_ID_PREFIX,
  BOOT_RELOAD_DELAY_MS,
  FULLY_COMMANDS,
};
