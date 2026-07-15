// Request validation at the API edge, backed by Zod.
//
// WHY THIS EXISTS. Until now every route hand-rolled its own input checks —
// `if (!x || x < 1 || x > 5)` — which is where subtle bugs live: a JSON string
// "4" slips past a numeric `<`/`>` comparison and lands in the database as text,
// a fractional 3.5 passes a 1..5 range check, an absent field reads as undefined
// three lines later. A schema states the shape once and rejects everything else
// with one consistent 400 before the handler (or the database) ever sees it.
//
// SHAPE. On success the PARSED value is written back onto the request, so the
// handler reads coerced, typed data (`req.body.rating_value` is a real integer),
// never the raw string the client sent. On failure the response is the same
// `{ error }` object the rest of the API returns — the frontend already reads
// `.error` — plus a `details[]` breakdown for logs and debugging.
//
// SYNCHRONOUS ON PURPOSE. `safeParse` never rejects a promise, so this middleware
// cannot throw asynchronously — the one thing Express 4's error handler does NOT
// catch (see server.js). A malformed body is a 400 here, never an unhandled
// rejection that has to be swept up by the process-level guard.

const { z } = require('zod');

/**
 * Build a middleware that validates any of req.body / req.params / req.query
 * against the given Zod schemas. Each provided part is replaced with its parsed
 * result; parts with no schema are left untouched.
 *
 * @param {{ body?: z.ZodType, params?: z.ZodType, query?: z.ZodType }} schemas
 */
function validate(schemas) {
  return (req, res, next) => {
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        const issues = result.error.issues;
        return res.status(400).json({
          // A single human-readable line for the UI's error banner...
          error: issues[0]?.message || 'Invalid request.',
          // ...and the full, field-addressed list for logs / API clients.
          details: issues.map((i) => ({
            field: [part, ...i.path].join('.'),
            message: i.message,
          })),
        });
      }
      req[part] = result.data;
    }
    next();
  };
}

/** Common case: validate only the JSON body. */
const validateBody = (schema) => validate({ body: schema });

module.exports = { validate, validateBody, z };
