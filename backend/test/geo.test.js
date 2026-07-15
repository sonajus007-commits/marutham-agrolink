// Unit tests for the haversine distance helper — the core of geofencing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { distanceMeters, isWithin } = require('../utils/geo');

test('distanceMeters — identical points are zero', () => {
  assert.equal(distanceMeters(10.5, 78.8, 10.5, 78.8), 0);
});

test('distanceMeters — one degree of latitude is ~111 km', () => {
  const d = distanceMeters(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111_195) < 100, `expected ~111195 m, got ${d}`);
});

test('distanceMeters — a small offset is in the right ballpark', () => {
  // ~0.0045° of latitude ≈ 500 m.
  const d = distanceMeters(13.0, 80.0, 13.0045, 80.0);
  assert.ok(d > 450 && d < 550, `expected ~500 m, got ${d}`);
});

test('distanceMeters — a missing or non-numeric coordinate is null, not a wrong number', () => {
  assert.equal(distanceMeters(10.5, 78.8, undefined, 78.8), null);
  assert.equal(distanceMeters(10.5, 78.8, '10.6', 78.8), null);
  assert.equal(distanceMeters(NaN, 78.8, 10.6, 78.8), null);
});

test('isWithin — inside the radius is true, outside is false, uncomparable is false', () => {
  assert.equal(isWithin(0, 0, 0.001, 0, 500), true); // ~111 m
  assert.equal(isWithin(0, 0, 1, 0, 500), false); // ~111 km
  assert.equal(isWithin(0, 0, null, 0, 500), false); // no point → not within
});
