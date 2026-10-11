/**
 * Treasure (/treasure): Monument Crates, Map Skin Crates and the Collection.
 * Free and non-monetized: a few free rolls per crate per day, no currency, no
 * purchases. Odds shown here are read from the server's active configuration
 * — the same numbers open_crate() uses.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, Gem, MapPin, Music, Palette, Plus, SkipForward, Sparkles, VolumeX } from 'lucide-react';
import { uiStore } from '@/app/store';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { useMapMutations, useMaps } from '@/features/maps/api';
import { MONUMENTS, RARITIES, RARITY, SKINS, defName, type CrateKind, type MonumentDef, type Rarity, type SkinDef } from './catalog';
import { useCollectiblesAccount, useCrateStatus, useEquipSkin, useInventory, useOpenCrate, useRollHistory, type RollResult } from './api';
import { Chest, CyclingPreview, Reveal, useRevealSequence } from './CrateOpening';
import { SkinSwatch } from './SkinSwatch';
import { skinFeatures, skinThemeFor } from './skins';
import { monumentThumbnail } from './three/thumbnails';

const ModelViewer = lazy(() => import('./three/ModelViewer'));
type Tab = 'monument' | 'skin' | 'collection';
const pref = (k: string, d: boolean) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
const savePref = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };

export function TreasureRoom() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'monument';
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="absolute inset-0 z-40 flex justify-center bg-neutral-900/35 p-2 backdrop-blur-[2px] sm:p-5">
      <section aria-labelledby="treasure-title" className="atlas-scroll flex h-full w-full max-w-[1120px] flex-col overflow-y-auto rounded-2xl bg-[#fbf3e2] shadow-float animate-rise-in">
        <header className="flex flex-wrap items-center gap-3 border-b border-[#ead9b8] px-4 py-3">
          <IconButton label="Return to map" onClick={back}><ArrowLeft className="size-4" aria-hidden /></IconButton>
          <div className="min-w-0 flex-1">
            <h1 id="treasure-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Gem className="size-5 text-[#b8860b]" aria-hidden />Treasure</h1>
            <p className="text-xs text-neutral-600">Free daily crates of 3D monuments and map skins. No purchases, no currency.</p>
          </div>
          <div role="tablist" aria-label="Treasure sections" className="flex rounded-xl bg-white p-1 ring-1 ring-[#ead9b8]">
            {([['monument', 'Monument Crates'], ['skin', 'Map Skin Crates'], ['collection', 'Collection']] as const).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                className={cn('h-8 rounded-lg px-3 text-xs font-semibold', tab === t ? 'bg-[#6b4a1f] text-white' : 'text-neutral-600 hover:text-neutral-900')}>{label}</button>
            ))}
          </div>
        </header>
        <div className="flex-1 p-3 sm:p-5">{tab === 'collection' ? <Collection /> : <CratePanel key={tab} crate={tab} />}</div>
      </section>
    </div>
  );
}

/** Basis points -> "29.9%", "1%", "0.1%" (exact; no rounding up). */
export const formatOdds = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : bp % 10 === 0 ? 1 : 2)}%`;

function OddsTable({ crate }: { crate: CrateKind }) {
  const status = useCrateStatus(crate);
  const defs = (crate === 'monument' ? MONUMENTS : SKINS) as (MonumentDef | SkinDef)[];
  if (status.isLoading) return <Spinner label="Loading odds" />;
  if (!status.data) return <p className="text-xs text-neutral-600">Odds are published by the Atlas server, which isn’t configured here.</p>;
  const w = status.data.weights;
  return (
    <section aria-label="Published drop rates" className="rounded-2xl bg-white p-3 ring-1 ring-[#ead9b8]">
      <h3 className="mb-1 text-sm font-semibold">Drop rates <span className="font-normal text-neutral-500">(version {status.data.version})</span></h3>
      <table className="w-full text-sm">
        <thead className="sr-only"><tr><th>Rarity</th><th>Chance per roll</th><th>Possible rewards</th></tr></thead>
        <tbody>
          {RARITIES.filter((r) => w[r] != null).map((r) => (
            <tr key={r} className="border-t border-[#f2e7d1] align-top">
              <td className="py-1 pr-2"><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: RARITY[r].soft, color: RARITY[r].ink }}>{RARITY[r].label}</span></td>
              <td className="py-1 pr-2 text-right font-semibold tabular-nums">{formatOdds(w[r])}</td>
              <td className="py-1 text-xs text-neutral-600">{defs.filter((d) => d.rarity === r).map((d) => d.name).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-neutral-500">Each roll is independent: the Mythic chance is {formatOdds(w.mythic)}{w.celestial != null ? ` and the Celestial chance ${formatOdds(w.celestial)}` : ''} every time, so no number of rolls guarantees one. Rarity is drawn first, then one reward of that rarity at equal odds.</p>
    </section>
  );
}

function CratePanel({ crate }: { crate: CrateKind }) {
  const { signedIn, configured } = useCollectiblesAccount();
  const status = useCrateStatus(crate);
  const history = useRollHistory(crate);
  const roll = useOpenCrate(crate);
  const toast = useToast();
  const [result, setResult] = useState<RollResult | null>(null);
  const [skip, setSkip] = useState(() => pref('atlas.crate.skip.v1', false));
  const [sound, setSound] = useState(() => pref('atlas.crate.sound.v1', false));
  const { phase, skipNow } = useRevealSequence(result, { skip, sound });
  const [placing, setPlacing] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);
  const left = status.data?.rollsLeft ?? null;
  const busy = roll.isPending || (result != null && phase !== 'reveal');
  const shownPhase = roll.isPending ? 'requesting' : phase;

  const open = () => {
    setResult(null);
    roll.mutate(undefined, { onSuccess: setResult, onError: (e) => toast.error(e) });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-b from-[#f3e2bf] to-[#fbf3e2] p-6" aria-live="polite">
        <p className="text-sm font-semibold text-[#6b4a1f]">{crate === 'monument' ? 'Monument Crate — colourful 3D landmarks for your maps' : 'Map Skin Crate — new looks for your personal maps'}</p>
        {shownPhase !== 'reveal' && <Chest phase={shownPhase} crate={crate} glow={result ? RARITY[result.rarity].color : undefined} />}
        {result && phase === 'cycling' && <CyclingPreview crate={crate} result={result} phase={phase} />}
        {result && phase === 'reveal' && (
          <Reveal crate={crate} result={result}>
            {crate === 'monument'
              ? <Button size="sm" variant="cta" icon={<MapPin className="size-4" aria-hidden />} onClick={() => setPlacing(result.defId)}>Place item</Button>
              : <Button size="sm" variant="cta" icon={<Palette className="size-4" aria-hidden />} onClick={() => setEquipping(result.defId)}>Equip or preview</Button>}
            <Button size="sm" variant="secondary" data-testid="reward-later" onClick={() => {
              setResult(null);
              toast.success(`${defName(result.defId)} is in your collection — ${crate === 'monument' ? 'place it' : 'equip it'} any time from Treasure → Collection.`);
            }}>Close / Later</Button>
          </Reveal>
        )}
        {roll.isPending && <p className="text-sm text-neutral-600">Opening… the server is choosing your reward.</p>}
        {result && phase !== 'reveal' && <Button size="sm" variant="ghost" icon={<SkipForward className="size-4" aria-hidden />} onClick={skipNow}>Skip animation</Button>}
        {!signedIn ? (
          <p className="max-w-sm text-center text-sm text-neutral-700">
            {configured ? <>Crates are saved to your account so rewards can’t be faked. <Link to="/auth?next=%2Ftreasure" className="font-medium text-brand underline">Sign in</Link> to open them.</> : 'Crates need the Atlas server, which isn’t configured here.'}
          </p>
        ) : (
          <>
            <Button variant="cta" className="h-11 px-6 text-base" icon={<Sparkles className="size-5" aria-hidden />} loading={roll.isPending} disabled={busy || left === 0} onClick={open}>
              {left === 0 ? 'No free rolls left today' : result ? 'Open another' : 'Open crate'}
            </Button>
            <p className="text-xs text-neutral-600">{left == null ? '' : `${left} of ${status.data?.dailyFreeRolls} free rolls left today · refresh at midnight UTC`}</p>
          </>
        )}
        <div className="flex gap-4 text-xs text-neutral-700">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={skip} onChange={(e) => { setSkip(e.target.checked); savePref('atlas.crate.skip.v1', e.target.checked); }} />Skip animations</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); savePref('atlas.crate.sound.v1', e.target.checked); }} />{sound ? <Music className="size-3.5" aria-hidden /> : <VolumeX className="size-3.5" aria-hidden />}Sound</label>
        </div>
      </div>
      <div className="space-y-4">
        <OddsTable crate={crate} />
        {signedIn && (
          <section aria-label="Recent rolls" className="rounded-2xl bg-white p-3 ring-1 ring-[#ead9b8]">
            <h3 className="mb-1 text-sm font-semibold">Recent rolls</h3>
            {history.isLoading ? <Spinner /> : history.error ? <ErrorMessage error={history.error} /> : !history.data?.length ? <p className="text-xs text-neutral-500">No rolls yet.</p> : (
              <ul className="space-y-1 text-sm">
                {history.data.map((h) => (
                  <li key={h.id} className="flex items-center gap-2">
                    <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: RARITY[h.rarity].soft, color: RARITY[h.rarity].ink }}>{RARITY[h.rarity].label}</span>
                    <span className="min-w-0 flex-1 truncate">{defName(h.defId)}</span>
                    {h.duplicate && <span className="text-[11px] text-neutral-500">duplicate</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      {placing && <PlaceOnMapDialog defId={placing} onClose={() => setPlacing(null)} />}
      {equipping && <EquipSkinDialog defId={equipping} onClose={() => setEquipping(null)} />}
    </div>
  );
}

// ---- Collection --------------------------------------------------------------------
function Thumb({ defId, owned, name }: { defId: string; owned: boolean; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    monumentThumbnail(defId).then((s) => alive && setSrc(s)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [defId]);
  if (failed) return <div className="grid h-28 place-items-center text-[11px] text-neutral-500">Preview unavailable</div>;
  if (!src) return <div className="h-28 animate-pulse rounded-xl bg-[#f3e6cc]" />;
  return <img src={src} alt={owned ? name : `${name} (not yet discovered)`} className={cn('h-28 w-full object-contain', !owned && 'opacity-60 brightness-0')} />;
}

function Collection() {
  const { signedIn } = useCollectiblesAccount();
  const inventory = useInventory();
  const [kind, setKind] = useState<CrateKind>('monument');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [region, setRegion] = useState('all');
  const [show, setShow] = useState<'all' | 'owned' | 'missing'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const copies = useMemo(() => new Map((inventory.data ?? []).map((i) => [i.defId, i.copies])), [inventory.data]);
  const defs = (kind === 'monument' ? MONUMENTS : SKINS) as (MonumentDef | SkinDef)[];
  const regions = [...new Set(MONUMENTS.map((m) => m.region))].sort();
  const list = defs.filter((d) => (rarity === 'all' || d.rarity === rarity) && (kind !== 'monument' || region === 'all' || (d as MonumentDef).region === region)
    && (show === 'all' || (show === 'owned') === copies.has(d.defId)));
  const owned = defs.filter((d) => copies.has(d.defId)).length;
  const total = defs.reduce((n, d) => n + (copies.get(d.defId) ?? 0), 0);
  const sel = defs.find((d) => d.defId === selected) ?? null;
  const select = (cls: string) => cn('h-8 rounded-lg border border-[#ead9b8] bg-white px-2 text-xs', cls);

  return (
    <div className="space-y-4">
      {!signedIn && <p className="rounded-xl bg-white p-3 text-sm text-neutral-700 ring-1 ring-[#ead9b8]">Browse every reward below. <Link to="/auth?next=%2Ftreasure" className="font-medium text-brand underline">Sign in</Link> to collect them.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Collection type" className="flex rounded-lg bg-white p-0.5 ring-1 ring-[#ead9b8]">
          {([['monument', 'Monuments'], ['skin', 'Map skins']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setSelected(null); }} className={cn('h-7 rounded-md px-3 text-xs font-semibold', kind === k ? 'bg-[#6b4a1f] text-white' : 'text-neutral-600')}>{label}</button>
          ))}
        </div>
        <label className="text-xs">Rarity <select className={select('ml-1')} value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}><option value="all">All</option>{RARITIES.map((r) => <option key={r} value={r}>{RARITY[r].label}</option>)}</select></label>
        {kind === 'monument' && <label className="text-xs">Region <select className={select('ml-1')} value={region} onChange={(e) => setRegion(e.target.value)}><option value="all">All</option>{regions.map((r) => <option key={r}>{r}</option>)}</select></label>}
        <label className="text-xs">Show <select className={select('ml-1')} value={show} onChange={(e) => setShow(e.target.value as typeof show)}><option value="all">All</option><option value="owned">Collected</option><option value="missing">Undiscovered</option></select></label>
        <p className="ml-auto text-sm" aria-live="polite"><span className="font-semibold">{owned}/{defs.length}</span> unique collected · {total} total copies</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#f0e0c0]" role="progressbar" aria-label="Collection completion" aria-valuemin={0} aria-valuemax={defs.length} aria-valuenow={owned}>
        <div className="h-full bg-[#b8860b] transition-[width] duration-500" style={{ width: `${(owned / defs.length) * 100}%` }} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label={kind === 'monument' ? 'Monuments' : 'Map skins'}>
          {list.map((d) => {
            const have = copies.get(d.defId) ?? 0;
            return (
              <li key={d.defId}>
                <button type="button" onClick={() => setSelected(d.defId)} aria-pressed={selected === d.defId}
                  className={cn('w-full rounded-2xl bg-white p-2 text-left ring-1 transition hover:-translate-y-0.5', selected === d.defId ? 'ring-2 ring-[#6b4a1f]' : 'ring-[#ead9b8]')}>
                  {kind === 'monument' ? <Thumb defId={d.defId} owned={have > 0} name={d.name} /> : <SkinSwatch defId={d.defId} className={cn('h-28 w-full rounded-xl', !have && 'opacity-40 grayscale')} />}
                  <p className="mt-1 truncate text-sm font-semibold">{d.name}</p>
                  <p className="flex items-center justify-between text-[11px]">
                    <span className="rounded-full px-1.5 font-semibold" style={{ background: RARITY[d.rarity].soft, color: RARITY[d.rarity].ink }}>{RARITY[d.rarity].label}</span>
                    <span className="text-neutral-500">{have ? `×${have}` : 'Undiscovered'}</span>
                  </p>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="col-span-full text-sm text-neutral-500">Nothing matches these filters.</li>}
        </ul>
        <aside aria-label="Selected collectible" className="rounded-2xl bg-white p-4 ring-1 ring-[#ead9b8]">
          {sel ? <CollectibleDetail def={sel} kind={kind} copies={copies.get(sel.defId) ?? 0} /> : <p className="text-sm text-neutral-500">Select a monument or skin to inspect it.</p>}
        </aside>
      </div>
    </div>
  );
}

function CollectibleDetail({ def, kind, copies }: { def: MonumentDef | SkinDef; kind: CrateKind; copies: number }) {
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const r = RARITY[def.rarity];
  return (
    <div className="space-y-3">
      {kind === 'monument' ? (
        copies > 0 ? (
          <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-[#f3e6cc]" />}><ModelViewer key={def.defId} defId={def.defId} label={def.name} glow={r.color} className="h-56 rounded-xl bg-gradient-to-b from-[#f7ecd6] to-white" /></Suspense>
        ) : <div className="rounded-xl bg-[#f7ecd6] p-2"><Thumb defId={def.defId} owned={false} name={def.name} /><p className="text-center text-xs text-neutral-600">Undiscovered — open Monument Crates to find it.</p></div>
      ) : <SkinSwatch defId={def.defId} className="h-40 w-full rounded-xl" />}
      <div>
        <h3 className="text-lg font-semibold">{def.name}</h3>
        <p className="flex items-center gap-2 text-xs"><span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: r.soft, color: r.ink }}>{r.label}</span>{'region' in def && <span className="text-neutral-600">{def.region}</span>}<span className="text-neutral-500">{copies ? `You have ${copies}` : 'Not collected'}</span></p>
      </div>
      <p className="text-sm text-neutral-700">{def.description}</p>
      {kind === 'skin' && <ul className="flex flex-wrap gap-1 text-[11px]">{skinFeatures(skinThemeFor(def.defId)!).map((f) => <li key={f} className="rounded-full bg-[#f3e6cc] px-2 py-0.5">{f}</li>)}</ul>}
      <div className="flex flex-wrap gap-2">
        {kind === 'monument' && copies > 0 && <Button size="sm" variant="cta" icon={<MapPin className="size-4" aria-hidden />} onClick={() => setPlacing(true)}>Place on My Map</Button>}
        {kind === 'monument' && 'latitude' in def && def.latitude != null && def.longitude != null && (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/?${new URLSearchParams({ at: `${def.latitude},${def.longitude}`, landmark: def.name })}`)}>Locate the real landmark</Button>
        )}
        {kind === 'skin' && <Button size="sm" variant={copies ? 'cta' : 'secondary'} icon={copies ? <Palette className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} onClick={() => setEquipping(true)}>{copies ? 'Equip or preview' : 'Preview on a map'}</Button>}
      </div>
      {kind === 'monument' && 'wikidata' in def && <p className="text-[11px] text-neutral-500">{def.attribution} {def.fictional ? <span className="font-medium">Fictional — not a real place.</span> : def.wikidata && <a className="underline" href={`https://www.wikidata.org/wiki/${def.wikidata}`} target="_blank" rel="noopener noreferrer">Wikidata {def.wikidata}</a>}</p>}
      {placing && <PlaceOnMapDialog defId={def.defId} onClose={() => setPlacing(false)} />}
      {equipping && <EquipSkinDialog defId={def.defId} onClose={() => setEquipping(false)} />}
    </div>
  );
}

/** Choose (or create) a personal map, then enter placement mode there. */
function MapChooser({ title, action, onPick, onClose, children }: { title: string; action: string; onPick: (mapId: string) => void; onClose: () => void; children?: React.ReactNode }) {
  const maps = useMaps();
  const { create } = useMapMutations();
  const [mapId, setMapId] = useState('');
  const [newName, setNewName] = useState('');
  useEffect(() => { if (!mapId && maps.data?.[0]) setMapId(maps.data[0].id); }, [maps.data, mapId]);
  return (
    <Dialog open onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="cta" disabled={!mapId} onClick={() => onPick(mapId)}>{action}</Button></>}>
      <div className="space-y-3">
        {maps.isLoading ? <Spinner /> : (
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium">Your maps</legend>
            {maps.data?.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
                <input type="radio" name="map" checked={mapId === m.id} onChange={() => setMapId(m.id)} />{m.name}
              </label>
            ))}
          </fieldset>
        )}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate({ name: newName.trim() }, { onSuccess: (m) => { setMapId(m.id); setNewName(''); } }); }}>
          <div className="flex-1"><TextField label="Or create a new map" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} /></div>
          <Button size="sm" type="submit" icon={<Plus className="size-4" aria-hidden />} loading={create.isPending} disabled={!newName.trim()}>Create</Button>
        </form>
        <ErrorMessage error={create.error ?? maps.error} />
        {children}
      </div>
    </Dialog>
  );
}

export function PlaceOnMapDialog({ defId, onClose }: { defId: string; onClose: () => void }) {
  const navigate = useNavigate();
  return <MapChooser title={`Place ${defName(defId)}`} action="Choose position on map" onClose={onClose}
    onPick={(mapId) => { onClose(); navigate(`/maps/${mapId}?placeMonument=${encodeURIComponent(defId)}`); }} />;
}

function EquipSkinDialog({ defId, onClose }: { defId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const inventory = useInventory();
  const toast = useToast();
  const owned = inventory.data?.some((i) => i.defId === defId);
  const [mapId, setMapId] = useState<string | null>(null);
  const equip = useEquipSkin(mapId ?? '');
  useEffect(() => {
    if (!mapId) return;
    equip.mutate(defId, { onSuccess: () => { toast.success(`${defName(defId)} equipped.`); onClose(); navigate(`/maps/${mapId}`); }, onError: (e) => { toast.error(e); setMapId(null); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);
  return (
    <MapChooser title={`${owned ? 'Equip' : 'Preview'} ${defName(defId)}`} action={owned ? 'Equip on this map' : 'Preview on this map'} onClose={onClose}
      onPick={(id) => {
        if (owned) setMapId(id);
        else { uiStore.set({ skinPreview: { mapId: id, defId } }); onClose(); navigate(`/maps/${id}`); }
      }}>
      <p className="text-xs text-neutral-600">Skins change only your personal map — never Discover or shared maps.{owned ? ' You can also preview first from the map itself.' : ' Previewing isn’t saved.'}</p>
    </MapChooser>
  );
}
