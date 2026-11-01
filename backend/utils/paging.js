// Reading past PostgREST's silent 1,000-row limit.
//
// A plain select stops at 1,000 rows with no error, so any total or "already done" check
// built on one starts to lie once a table outgrows it. fetchAll pages until a short page
// comes back. The caller's query must have a stable .order(), or rows can repeat or be
// skipped between pages. inChunks also splits long .in() lists, which otherwise grow
// past what a URL can carry.

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 200;

/** @param build () => a fresh query each call. Returns { data, error }. */
async function fetchAll(build, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

/** Runs build(ids) per chunk of `values`, paging each. Returns { data, error }. */
async function inChunks(values, build, chunkSize = CHUNK_SIZE) {
  const rows = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const { data, error } = await fetchAll(() => build(chunk));
    if (error) return { data: null, error };
    rows.push(...data);
  }
  return { data: rows, error: null };
}

module.exports = { fetchAll, inChunks, PAGE_SIZE, CHUNK_SIZE };
