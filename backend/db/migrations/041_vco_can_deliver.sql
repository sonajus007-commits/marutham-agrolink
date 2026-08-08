-- 041 — VCO can also serve as a nearby Delivery Agent.
--
-- An additive capability, NOT a role change: a VCO keeps their role_id, VCO
-- designation and career band, and simply gains delivery duties on top. It works
-- exactly like the is_hr_admin / is_board_director trust flags — the permission
-- resolver UNIONs the Delivery Agent role's permissions when this is set (see
-- middleware/permissions.js), and eligible-agents offers the VCO for delivery
-- legs they already cover (users.service_areas), so "nearby only" falls out of
-- the existing coverage match.
--
-- The flag lives on users (the login/agent) rather than employees because both
-- readers query users: requireAuth loads the row every request, and
-- eligible-agents filters the candidate pool directly.

alter table users
  add column if not exists can_deliver boolean not null default false;

-- Defense in depth: only a VCO may carry the flag. The delivery capability is
-- meaningless on any other role, and the admin toggle only offers it for VCOs.
do $$ begin
  alter table users
    add constraint users_can_deliver_vco_only
    check (can_deliver = false or admin_role = 'VCO');
exception when duplicate_object then null;
end $$;
