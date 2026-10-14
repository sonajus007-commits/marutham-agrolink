const test = require('node:test');
const assert = require('node:assert');
const { tablesWithoutRls } = require('../db/check-rls');

const f = (sql) => ({ name: 'x.sql', sql });

test('tablesWithoutRls', async (t) => {
  await t.test('a created table with no RLS statement is reported', () => {
    assert.deepStrictEqual(tablesWithoutRls([f('create table if not exists foo (id int);')]), ['foo']);
  });

  await t.test('enabling RLS in a later migration clears it', () => {
    const files = [f('create table foo (id int);'), f('alter table public.foo enable row level security;')];
    assert.deepStrictEqual(tablesWithoutRls(files), []);
  });

  await t.test('a later DISABLE re-opens the table', () => {
    const files = [
      f('CREATE TABLE "foo" (id int); ALTER TABLE foo ENABLE ROW LEVEL SECURITY;'),
      f('alter table if exists only foo disable row level security;'),
    ];
    assert.deepStrictEqual(tablesWithoutRls(files), ['foo']);
  });

  await t.test('snapshot tables count even when no migration creates them', () => {
    assert.deepStrictEqual(tablesWithoutRls([], ['users']), ['users']);
  });

  await t.test('statements inside comments do not count', () => {
    const files = [f('create table foo (id int);\n-- alter table foo enable row level security;\n/* alter table foo enable row level security; */')];
    assert.deepStrictEqual(tablesWithoutRls(files), ['foo']);
  });
});
