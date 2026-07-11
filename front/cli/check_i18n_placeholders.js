/* eslint-disable no-console */
/**
 * Compares {{var}} and %token% placeholders between en.json and another
 * translation file. Usage: node ./cli/check_i18n_placeholders.js uk
 */
const en = require('../src/config/i18n/en.json');

const lang = process.argv[2];
if (!lang) {
  console.error('Usage: node ./cli/check_i18n_placeholders.js <lang>');
  process.exit(2);
}
const other = require(`../src/config/i18n/${lang}.json`);

const PLACEHOLDER_REGEX = /{{[^}]+}}|%[a-zA-Z_]+%/g;

const getTokens = str => (str.match(PLACEHOLDER_REGEX) || []).sort().join('|');

const errors = [];

const walk = (enNode, otherNode, path) => {
  if (typeof enNode === 'string') {
    if (typeof otherNode !== 'string') {
      errors.push(`${path}: missing or not a string in ${lang}.json`);
    } else if (getTokens(enNode) !== getTokens(otherNode)) {
      errors.push(`${path}: placeholders differ\n  en: ${enNode}\n  ${lang}: ${otherNode}`);
    }
    return;
  }
  Object.keys(enNode).forEach(key => {
    walk(enNode[key], otherNode ? otherNode[key] : undefined, path ? `${path}.${key}` : key);
  });
};

walk(en, other, '');

if (errors.length > 0) {
  console.error(`${errors.length} placeholder mismatches:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`${lang}.json placeholders OK`);
