// A stand-in for the supabase-js client, for route tests.
//
// WHY A FAKE AND NOT A DATABASE. The bugs these tests exist to prevent are
// ERROR-HANDLING bugs: a guard whose query fails does not reject, it evaporates,
// and the route waves the request through. To test that, you must make the query
// FAIL ON DEMAND — and you cannot reliably make a real Postgres return an error at
// the moment a test wants one. Only a double can.
//
// It also means these tests need no database, so they run in CI (which has none)
// and never touch the one Supabase project that exists.
//
// WHAT THIS CANNOT SEE, and what covers it instead: whether a column or a
// relationship actually exists. The fake believes whatever the test tells it. That
// gap is already closed against the REAL schema by `db:check-embeds` (every
// embedded select is executed) and `db:check-schema` (every column is diffed). The
// two are complementary — this one tests our logic, those test our assumptions.
//
// PGRST116 IS MODELLED FAITHFULLY, because it is the trap that makes these guards
// subtle:
//
//   .single()      0 rows → error PGRST116   1 row → the row   2+ rows → error
//   .maybeSingle() 0 rows → null, NO error   1 row → the row   2+ rows → error
//
// `.single()` treating "nothing matched" as a FAILURE is why you cannot simply add
// `if (error) → 500` to one: an ordinary "not found" becomes a 500. And
// `.maybeSingle()` raising on 2+ rows is why a guard against duplicates must not
// use it — the moment a duplicate exists, the guard that would have caught it
// errors instead, and an unread error lets the next one through too.
//
// A fake that returned a bare null for both cases could not test either.

/** The error PostgREST returns when a single-object request matches the wrong number of rows. */
function pgrst116(n) {
  return {
    code: 'PGRST116',
    message: 'Cannot coerce the result to a single JSON object',
    details: `The result contains ${n} rows`,
    hint: null,
  };
}

/**
 * Apply the SCOPING filters the route asked for: `eq`, `in`, and IS [NOT] NULL.
 *
 * Deliberately only these. A fake that reimplements PostgREST's filter language
 * becomes a second, worse database that has to be kept in sync with the first — but
 * these are what SCOPE a query, and a fake that ignores them answers questions the
 * route never asked. `payouts/run` reads order_items `.in('order_id',
 * unpaidOrderIds)`; a fake that returned every item regardless would show the
 * settlement paying an order it had correctly excluded, which is a lie about the
 * code under test. Everything else (order, limit, ilike, …) is still recorded and
 * ignored — assert on `calls` if a test cares.
 *
 * IS NULL joined the list when the soft delete landed. `.is('deleted_at', null)` is
 * now the filter that hides removed staff from every list, and a fake that recorded
 * it but did not apply it would hand back the removed employee and let a test that
 * asserts "they are gone from the list" pass while the route was still returning
 * them. The one filter this feature depends on cannot be the one the fake pretends
 * to honour.
 *
 * Absent columns still pass, as before: a fixture row that never mentions deleted_at
 * is a live row, so tests written before this existed keep their meaning.
 *
 * `neq` joined for the same reason when multi-vendor order splitting landed. A split
 * order is a parent row PLUS one child per seller, and `.neq('route', 'split')` is
 * what keeps the container out of the lists that hold physical parcels — the agent's
 * pickup queue most of all, where a fake that ignored it would let a test assert "the
 * container is not in the queue" while the route was happily putting it there.
 */
function applyFilters(rows, ctx) {
  if (!Array.isArray(rows)) return rows;
  return rows.filter((row) => ctx.filters.every(([op, col, val, val2]) => {
    if (op === 'eq') return row[col] === undefined || row[col] === val;
    if (op === 'neq') return row[col] === undefined || row[col] !== val;
    if (op === 'in') return row[col] === undefined || (Array.isArray(val) && val.includes(row[col]));
    // .is(col, null) → IS NULL. Absent and explicit-null both count as null.
    if (op === 'is' && val === null) return row[col] === undefined || row[col] === null;
    // .not(col, 'is', null) → IS NOT NULL.
    if (op === 'not' && val === 'is' && val2 === null) return row[col] !== undefined && row[col] !== null;
    return true;
  }));
}

/**
 * @param {object} [handlers] optional initial handlers, `{ 'table:op': response }`
 *
 * A handler is either a response object or a function of the call context.
 * A response is `{ data, error, count }`; for reads, `data` should be an ARRAY of
 * rows and the fake applies single/maybeSingle coercion to it, exactly as
 * PostgREST would.
 */
function fakeSupabase(handlers = {}) {
  const registry = new Map(Object.entries(handlers));
  /** Every call made, in order. Assert against this to prove a write was attempted. */
  const calls = [];

  function lookup(ctx) {
    const h = registry.has(`${ctx.table}:${ctx.op}`) ? registry.get(`${ctx.table}:${ctx.op}`)
            : registry.has(`${ctx.table}:*`)         ? registry.get(`${ctx.table}:*`)
            : undefined;
    if (h === undefined) return { data: [], error: null };
    return typeof h === 'function' ? h(ctx) : h;
  }

  function settle(ctx) {
    const raw = lookup(ctx) || {};
    // `cols` is recorded so a test can prove a route ASKED for a column. A route whose
    // select lists its columns explicitly does not see a newly added one — the column
    // exists, the row comes back without it, and the check that reads it silently sees
    // undefined. requireAuth's deleted_at check is exactly that shape.
    calls.push({ table: ctx.table, op: ctx.op, payload: ctx.payload, filters: ctx.filters, single: ctx.single, cols: ctx.cols });

    if (raw.error) return { data: null, error: raw.error, count: null };

    // head+count requests answer with a count and no rows.
    if (ctx.head) {
      const rows = applyFilters(raw.data ?? [], ctx);
      return { data: null, error: null, count: raw.count ?? (Array.isArray(rows) ? rows.length : 0) };
    }

    // Reads are scoped by the filters the route asked for; writes are not (an
    // update's filters say WHICH rows, and the fake has no rows to update).
    let data = ctx.op === 'select' ? applyFilters(raw.data ?? [], ctx) : (raw.data ?? []);

    // Coerce to a single object the way PostgREST does — including its errors.
    if (ctx.single) {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) {
        // This is the split that matters. `.single()` treats "nothing matched" as a
        // FAILURE; `.maybeSingle()` treats it as an answer.
        return ctx.single === 'single'
          ? { data: null, error: pgrst116(0), count: null }
          : { data: null, error: null, count: null };
      }
      if (rows.length > 1) return { data: null, error: pgrst116(rows.length), count: null };
      return { data: rows[0], error: null, count: null };
    }

    return { data, error: null, count: raw.count ?? null };
  }

  /** The chainable query builder. Every filter is recorded; nothing is evaluated. */
  function builder(table, op, payload) {
    const ctx = { table, op, payload, filters: [], single: null, head: false, cols: null };

    const chain = {
      // Filters and modifiers — recorded, then ignored. These tests assert on the
      // route's DECISIONS, not on query semantics the database already owns.
      select(cols, opts) {
        if (cols !== undefined) ctx.cols = cols;
        if (opts && opts.head) ctx.head = true;
        // `.insert(x).select()` turns a write into a read-back; keep the write op.
        return chain;
      },
      single()      { ctx.single = 'single';      return chain; },
      maybeSingle() { ctx.single = 'maybeSingle'; return chain; },

      // Thenable: `await supabase.from(…)…` resolves here.
      then(resolve, reject) { return Promise.resolve(settle(ctx)).then(resolve, reject); },
      catch(f)  { return Promise.resolve(settle(ctx)).catch(f); },
      finally(f) { return Promise.resolve(settle(ctx)).finally(f); },
    };

    for (const m of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'or', 'not', 'order', 'limit', 'range', 'contains', 'filter']) {
      chain[m] = (...args) => { ctx.filters.push([m, ...args]); return chain; };
    }
    return chain;
  }

  return {
    from(table) {
      return {
        select: (cols, opts) => builder(table, 'select').select(cols, opts),
        insert: (payload) => builder(table, 'insert', payload),
        update: (payload) => builder(table, 'update', payload),
        upsert: (payload) => builder(table, 'upsert', payload),
        delete: ()        => builder(table, 'delete'),
      };
    },
    rpc: (name, args) => builder(`rpc:${name}`, 'rpc', args),

    /** Programme a response. `op` is select/insert/update/delete/upsert/rpc, or '*'. */
    on(table, op, response) { registry.set(`${table}:${op}`, response); return this; },

    calls,
    /** Every call made against `table` (optionally narrowed to one op). */
    callsTo(table, op) { return calls.filter((c) => c.table === table && (!op || c.op === op)); },
    reset() { calls.length = 0; },
  };
}

module.exports = { fakeSupabase, pgrst116, applyFilters };
