/** Account menu (top-right): Settings, Friends, sign in/out. Distinct from map filters. */
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Settings, UserRound, Users } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { requireSupabase } from '@/lib/supabase';
import { useProfile } from '@/features/settings/profileApi';
import { Popover } from '@/components/ui/Popover';
import { useToast } from '@/components/ui/Toast';

export function AccountMenu() {
  const { user } = useAuth();
  const profile = useProfile();
  const navigate = useNavigate();
  const toast = useToast();

  if (!user) {
    return (
      <Link to="/auth" data-tour="account-menu" className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-neutral-800 ring-1 ring-line hover:bg-neutral-100">
        <LogIn className="size-4" aria-hidden /><span className="sr-only sm:not-sr-only">Sign in</span>
      </Link>
    );
  }
  const name = profile.data?.displayName || profile.data?.username || user.email || 'Account';

  return (
    <Popover label="Account menu" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} data-tour="account-menu" aria-label={`Account menu for ${name}`}
        className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold uppercase text-brand ring-2 ring-white hover:ring-brand/30">
        {profile.data ? name[0] : <UserRound className="size-4" aria-hidden />}
      </button>
    )}>
      {(close) => (
        <div className="w-60 p-1.5">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            {profile.data && <p className="truncate text-xs text-neutral-500">@{profile.data.username}</p>}
          </div>
          <div className="my-1 border-t border-neutral-100" />
          <MenuLink to="/settings/account" onClick={close} icon={<Settings className="size-4" aria-hidden />}>Settings</MenuLink>
          <MenuLink to="/settings/friends" onClick={close} icon={<Users className="size-4" aria-hidden />}>Friends</MenuLink>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100"
            onClick={async () => {
              close();
              await requireSupabase().auth.signOut();
              toast.info('Signed out.');
              navigate('/');
            }}>
            <LogOut className="size-4" aria-hidden />Sign out
          </button>
        </div>
      )}
    </Popover>
  );
}

function MenuLink({ to, children, icon, onClick }: { to: string; children: React.ReactNode; icon: React.ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neutral-100">{icon}{children}</Link>
  );
}
