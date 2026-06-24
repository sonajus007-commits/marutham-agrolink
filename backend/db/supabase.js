const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,  // service role key bypasses RLS — safe server-side only
  { realtime: { transport: ws } }
);

module.exports = supabase;
