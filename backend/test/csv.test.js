// The CSV builder (utils/csv) must quote correctly so a name with a comma or a note
// with a newline can never shift the columns, and money must render as a plain
// rupee number a spreadsheet can sum.

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, rupees } = require('../utils/csv');

const headers = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
];

test('a plain row is comma-joined with a header line', () => {
  const csv = toCsv(headers, [{ a: '1', b: '2' }]);
  assert.match(csv, /A,B\r\n1,2\r\n$/);
});

test('a field with a comma, quote or newline is quoted and quotes are doubled', () => {
  const csv = toCsv(headers, [{ a: 'Murugan, S', b: 'line1\nline2' }, { a: 'he said "hi"', b: 'x' }]);
  assert.match(csv, /"Murugan, S","line1\nline2"/);
  assert.match(csv, /"he said ""hi"""/);
});

test('null / undefined become empty cells', () => {
  const csv = toCsv(headers, [{ a: null, b: undefined }]);
  assert.match(csv, /\r\n,\r\n$/);
});

test('rupees() converts paise to a plain 2-decimal rupee string', () => {
  assert.equal(rupees(4215), '42.15');
  assert.equal(rupees(0), '0.00');
  assert.equal(rupees(null), '');
  assert.equal(rupees('12300'), '123.00');
});

test('the output starts with a UTF-8 BOM so Excel reads Tamil correctly', () => {
  assert.ok(toCsv(headers, []).startsWith('﻿'));
});
