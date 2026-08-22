-- Migration: merge the "City" field into "Village / Town / City"
--
-- The address forms used to capture two separate locality fields — village_town
-- AND city — which produced split, half-filled data (some rows carried the place
-- name in `city`, others in `village_town`). They are now ONE merged field, with
-- `village_town` as the canonical column. Delivery still routes on pincode + taluk
-- + the GPS pin, so collapsing the human-readable locality label is safe.
--
-- This backfills the canonical column from the legacy one wherever it is empty, so
-- existing rows read correctly. The app already coalesces `village_town || city`
-- at read time, so this is belt-and-suspenders for direct queries / reporting.
--
-- `city` is intentionally KEPT (not dropped): older delivery_address JSONB blobs
-- and any external reader may still reference it, and the read-time fallback relies
-- on it. Nothing writes `city` any more.
--
-- Only `users` and `employees` carry the village_town + city pair. Orders track
-- locality differently (village / delivery_village), so they are untouched.
--
-- Idempotent: the WHERE clause only touches rows whose village_town is still blank.

update users
   set village_town = city
 where (village_town is null or btrim(village_town) = '')
   and city is not null and btrim(city) <> '';

update employees
   set village_town = city
 where (village_town is null or btrim(village_town) = '')
   and city is not null and btrim(city) <> '';
