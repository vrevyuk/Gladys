/**
 * @description Return the dayjs format token for a user's time-format preference.
 * @param {string} preference - One of 'auto', '12h', '24h' (anything else is treated as 'auto').
 * @param {object} [options] - Options.
 * @param {boolean} [options.withSeconds] - Whether to include seconds.
 * @returns {string} A dayjs format token.
 * @example
 * dayjs().format(timeFormatToken(user.time_format));
 */
export function timeFormatToken(preference, { withSeconds = false } = {}) {
  if (preference === '12h') {
    return withSeconds ? 'h:mm:ss A' : 'h:mm A';
  }
  if (preference === '24h') {
    return withSeconds ? 'HH:mm:ss' : 'HH:mm';
  }
  // 'auto' or undefined: follow the locale (requires dayjs localizedFormat plugin at the call site)
  return withSeconds ? 'LTS' : 'LT';
}
