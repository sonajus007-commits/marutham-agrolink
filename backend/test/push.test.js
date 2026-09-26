// Phone push sender (utils/push). The supabase client is stubbed in require.cache and
// the FCM client injected, so nothing leaves the process.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { fakeSupabase } = require('./helpers/fakeSupabase');

const SUPABASE_MODULE = require.resolve('../db/supabase');
const PUSH_MODULE = path.join(__dirname, '..', 'utils', 'push.js');
const NOTIFY_MODULE = path.join(__dirname, '..', 'utils', 'notifications.js');

let db;

function load() {
  for (const p of [SUPABASE_MODULE, PUSH_MODULE, NOTIFY_MODULE]) delete require.cache[p];
  require.cache[SUPABASE_MODULE] = {
    id: SUPABASE_MODULE, filename: SUPABASE_MODULE, loaded: true, exports: db,
  };
  return { push: require(PUSH_MODULE), notifications: require(NOTIFY_MODULE) };
}

// Fake FCM: records every multicast; `verdict(token)` → null (ok) or an error code.
function fakeMessaging(verdict = () => null) {
  const sent = [];
  return {
    sent,
    async sendEachForMulticast(msg) {
      sent.push(msg);
      const responses = msg.tokens.map((t) => {
        const code = verdict(t);
        return code ? { success: false, error: { code } } : { success: true };
      });
      return { responses, failureCount: responses.filter((r) => !r.success).length };
    },
  };
}

const EVENT = { type: 'collection_ready', title: 'Ready to collect', body: 'Order A1 is packed', data: { order_id: 'o1', stage: 4 } };

beforeEach(() => {
  db = fakeSupabase({
    'device_tokens:select': { data: [
      { user_id: 'u1', token: 'tok-a' },
      { user_id: 'u1', token: 'tok-b' },
      { user_id: 'u2', token: 'tok-c' },
    ] },
  });
});

test('disabled (no service account) → no token read, no send', async () => {
  const { push } = load();
  push._setMessagingForTest(null);
  await push.pushToUsers(['u1'], EVENT);
  assert.equal(db.callsTo('device_tokens').length, 0);
});

test('sends one multicast to every device of the users, data flattened to strings', async () => {
  const { push } = load();
  const fcm = fakeMessaging();
  push._setMessagingForTest(fcm);
  await push.pushToUsers(['u1', 'u1', null], EVENT);

  const read = db.callsTo('device_tokens', 'select')[0];
  assert.deepEqual(read.filters, [['in', 'user_id', ['u1']]]);
  assert.equal(fcm.sent.length, 1);
  assert.deepEqual(fcm.sent[0].tokens, ['tok-a', 'tok-b']);
  assert.deepEqual(fcm.sent[0].notification, { title: 'Ready to collect', body: 'Order A1 is packed' });
  assert.deepEqual(fcm.sent[0].data, { order_id: 'o1', stage: '4', type: 'collection_ready' });
  assert.equal(db.callsTo('device_tokens', 'delete').length, 0);
});

test('no registered devices → nothing sent', async () => {
  const { push } = load();
  const fcm = fakeMessaging();
  push._setMessagingForTest(fcm);
  await push.pushToUsers(['u9'], EVENT);
  assert.equal(fcm.sent.length, 0);
});

test('dead tokens are deleted; transient failures are kept', async () => {
  const { push } = load();
  push._setMessagingForTest(fakeMessaging((t) => ({
    'tok-a': 'messaging/registration-token-not-registered',
    'tok-b': 'messaging/internal-error',
    'tok-c': 'messaging/invalid-argument', // payload problem, not a dead device
  })[t] || null));
  await push.pushToUsers(['u1', 'u2'], EVENT);

  const del = db.callsTo('device_tokens', 'delete');
  assert.equal(del.length, 1);
  assert.deepEqual(del[0].filters, [['in', 'token', ['tok-a']]]);
});

test('token read error → no send, no throw', async () => {
  db.on('device_tokens', 'select', { error: { message: 'boom' } });
  const { push } = load();
  const fcm = fakeMessaging();
  push._setMessagingForTest(fcm);
  await push.pushToUsers(['u1'], EVENT);
  assert.equal(fcm.sent.length, 0);
});

test('FCM throwing never rejects', async () => {
  const { push } = load();
  push._setMessagingForTest({ sendEachForMulticast: async () => { throw new Error('network'); } });
  await assert.doesNotReject(push.pushToUsers(['u1'], EVENT));
});

test('notify() pushes after a successful bell insert, not after a failed one', async () => {
  let { push, notifications } = load();
  let fcm = fakeMessaging();
  push._setMessagingForTest(fcm);
  await notifications.notify('u1', EVENT);
  await new Promise((r) => setImmediate(r)); // push is fire-and-forget
  assert.equal(fcm.sent.length, 1);

  db.on('notifications', 'insert', { error: { message: 'insert failed' } });
  ({ push, notifications } = load());
  fcm = fakeMessaging();
  push._setMessagingForTest(fcm);
  await notifications.notifyMany(['u1', 'u2'], EVENT);
  await new Promise((r) => setImmediate(r));
  assert.equal(fcm.sent.length, 0);
});
