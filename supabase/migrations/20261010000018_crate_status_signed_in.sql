-- Keep the project invariant "anon can execute no public function" (0008).
-- Signed-out visitors read the published odds directly from crate_configs
-- (public SELECT); crate_status() (which also reports your rolls left) is for
-- signed-in users only.
revoke execute on function public.crate_status(text) from anon;
