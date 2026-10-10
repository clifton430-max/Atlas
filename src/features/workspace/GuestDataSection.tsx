/**
 * Settings → Guest data.
 *   As a guest: what's stored locally, storage status, export (JSON download)
 *     and reset.
 *   Signed in: the guest workspace still on this device, with an EXPLICIT
 *     "Import into my account" action (never automatic) and a separate
 *     "Clear guest data from this device".
 */
import { useState } from 'react';
import { Download, HardDrive, RotateCcw, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/AuthProvider';
import { requireSupabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { getGuestWorkspace, useWorkspace } from './WorkspaceProvider';
import { useLocalSnapshot } from './useLocalSnapshot';
import { importGuestData, type ImportSummary } from './importGuestData';

export function GuestDataSection() {
  const { user } = useAuth();
  const ws = useWorkspace();
  const guest = getGuestWorkspace();
  const snap = useLocalSnapshot(guest)!;
  const toast = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'reset' | 'import' | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const counts = `${snap.maps.length} map${snap.maps.length === 1 ? '' : 's'}, ${snap.groups.length} group${snap.groups.length === 1 ? '' : 's'}, ${snap.pins.length} pin${snap.pins.length === 1 ? '' : 's'}, ${snap.images.length} image${snap.images.length === 1 ? '' : 's'}`;
  const kb = (guest.approxBytes() / 1024).toFixed(1);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(guest.snapshot(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atlas-guest-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="max-w-xl space-y-6">
      <header className="pr-10">
        <h2 className="text-lg font-semibold">Guest data</h2>
        <p className="mt-0.5 text-sm text-neutral-500">Maps, groups, pins and images created without signing in.</p>
      </header>

      <div className="flex items-start gap-3 rounded-xl bg-neutral-50 p-4 text-sm">
        <HardDrive className="mt-0.5 size-5 text-neutral-500" aria-hidden />
        <div>
          <p className="font-medium">Stored only in this browser on this device</p>
          <p className="text-neutral-600">{counts} · about {kb} KB</p>
          <p className="mt-1 text-xs text-neutral-500">It isn’t uploaded anywhere. Anyone using this browser profile can see it. Clearing browser data removes it.</p>
          {!guest.persistent && <p className="mt-1 text-xs text-danger">This browser isn’t allowing storage, so guest data is kept only until you close the page.</p>}
          {guest.loadNotice && <p className="mt-1 text-xs text-amber-800">{guest.loadNotice}</p>}
        </div>
      </div>

      {ws.mode === 'sandbox' && <Notice>The tutorial is running in a separate practice sandbox; this section shows your real guest workspace.</Notice>}

      {user && !guest.isEmpty() && (
        <section aria-labelledby="import-heading" className="space-y-2">
          <h3 id="import-heading" className="text-sm font-semibold">Import into your account</h3>
          <p className="text-xs text-neutral-600">
            Copies your guest maps into your account as new maps named “… (from guest)”. Nothing in your account is overwritten; groups with the same name are reused unchanged.
            Saved events that don’t exist on the server (such as development samples) are skipped and listed.
          </p>
          <Button variant="primary" size="sm" icon={<Upload className="size-4" aria-hidden />} onClick={() => setConfirm('import')} disabled={busy}>Import guest data…</Button>
        </section>
      )}
      {summary && (
        <div role="status" className="rounded-xl bg-neutral-50 p-4 text-sm">
          <p className="font-medium">Import finished</p>
          <p className="text-neutral-600">
            {summary.mapsCreated} maps · {summary.pinsImported} pins · {summary.imagesUploaded} images · {summary.groupsCreated} new groups · {summary.groupsReused} existing groups reused
          </p>
          {summary.skipped.length > 0 && (
            <details className="mt-2 text-xs">
              <summary>{summary.skipped.length} item(s) skipped</summary>
              <ul className="mt-1 list-disc pl-5">{summary.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
          <p className="mt-2 text-xs text-neutral-500">Your guest data is still on this device. Clear it below if you no longer need it.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={exportJson}>Download a copy (JSON)</Button>
        <Button size="sm" variant="ghost" className="text-danger" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setConfirm('reset')}>
          {user ? 'Clear guest data from this device' : 'Reset guest workspace'}
        </Button>
      </div>

      <ConfirmDialog open={confirm === 'reset'} danger title={user ? 'Clear guest data?' : 'Reset guest workspace?'} confirmLabel={user ? 'Clear guest data' : 'Reset'}
        message="All guest maps, groups, pins and images on this device will be permanently removed. Account data is not affected."
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          try {
            guest.reset();
            if (!user) guest.createMap({ name: 'My Map' });
            qc.invalidateQueries({ predicate: (q) => q.queryKey.includes('guest') });
            toast.success('Guest workspace reset.');
          } catch (e) { toast.error(e); }
          setConfirm(null);
        }} />
      <ConfirmDialog open={confirm === 'import'} busy={busy} title="Import guest data into your account?" confirmLabel="Import"
        message={<>This copies {counts} into your account as new items. Existing account data is not changed.</>}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const s = await importGuestData(guest, requireSupabase());
            setSummary(s);
            await qc.invalidateQueries();
            toast.success(`Imported ${s.pinsImported} pins into ${s.mapsCreated} new maps.`);
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
            setConfirm(null);
          }
        }} />
    </div>
  );
}
