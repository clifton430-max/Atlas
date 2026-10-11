/**
 * Chess room (/chess, /chess/:gameId) — opened from the World Chess Hall of
 * Fame's details, or from a chess notification. Rendered as a sheet over the
 * map (the map stays mounted, so your view is unchanged when you return).
 *
 *   Play here: two players on this device; stored only in this browser.
 *   Play online: friends / collaborators, validated by the server.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Flag, FlipVertical2, Handshake, Link2, RotateCcw, Swords, Wifi } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { claimableDraw, TERMINATION_LABEL, type Outcome } from '../../../supabase/functions/_shared/chessGame';
import { ChessBoard, type BoardMove } from './ChessBoard';
import { claimLocalDraw, gameFrom, importLocalGame, loadLocalGame, newLocalGame, playLocal, saveLocalGame, type LocalChess } from './localGame';
import { chessGameLink, chessPositionLink, chessRoomLink, isUuid, parseChessMoves } from '@/lib/shareLinks';
import { useChessActions, useGame, useMyGames, useOpponents, type OnlineGame } from './online';
import { CHESS_VENUES } from './venues';

export function ChessRoom() {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const venue = params.get('venue');
  const [tab, setTab] = useState<'local' | 'online'>(gameId ? 'online' : 'local');
  useEffect(() => { if (gameId) setTab('online'); }, [gameId]);
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open], [aria-label="Choose promotion piece"]') && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="absolute inset-0 z-40 flex justify-center bg-neutral-900/30 p-2 backdrop-blur-[2px] sm:p-5">
      <section aria-labelledby="chess-title" className="atlas-scroll flex h-full w-full max-w-[1080px] flex-col overflow-y-auto rounded-2xl bg-[#fbf6ec] shadow-float animate-rise-in">
        <header className="flex items-center gap-3 border-b border-[#e8dcc6] px-4 py-3">
          <IconButton label="Return to map" onClick={back}><ArrowLeft className="size-4" aria-hidden /></IconButton>
          <div className="min-w-0 flex-1">
            <h1 id="chess-title" className="text-lg font-semibold tracking-tight">Chess room</h1>
            <p className="truncate text-xs text-neutral-600">{venue && CHESS_VENUES[venue] ? `At the ${CHESS_VENUES[venue].name}, St. Louis` : 'Play locally or with friends'}</p>
          </div>
          <CopyChessLink gameId={tab === 'online' ? gameId : undefined} venue={venue} />
          <div role="tablist" aria-label="Game mode" className="flex rounded-xl bg-white p-1 ring-1 ring-[#e8dcc6]">
            {([['local', 'Play here'], ['online', 'Play online']] as const).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                className={cn('h-8 rounded-lg px-3 text-xs font-semibold', tab === t ? 'bg-[#5b4632] text-white' : 'text-neutral-600 hover:text-neutral-900')}>
                {label}
              </button>
            ))}
          </div>
        </header>
        <div className="flex-1 p-3 sm:p-5">{tab === 'local' ? <LocalChessGame /> : <OnlineChess gameId={gameId} venue={venue} />}</div>
      </section>
    </div>
  );
}

/**
 * Copies the link for what is on screen: the online game (opens only for its
 * two players), or the local position (a validated copy for the recipient),
 * or the venue's chess room. Never creates a game or session.
 */
function CopyChessLink({ gameId, venue }: { gameId?: string; venue: string | null }) {
  const toast = useToast();
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = async () => {
    const local = loadLocalGame();
    const url = gameId ? chessGameLink(gameId) : local.moves.length ? chessPositionLink(local.moves, venue) : chessRoomLink(venue);
    const what = gameId ? 'Game link copied — it opens only for the two players.' : local.moves.length ? 'Position link copied — it opens a copy of this board.' : 'Chess room link copied.';
    try { await navigator.clipboard.writeText(url); toast.success(what); setFallback(null); } catch { setFallback(url); }
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={<Link2 className="size-4" aria-hidden />} onClick={copy} data-testid="copy-chess-link">
        <span className="hidden sm:inline">Copy link</span><span className="sr-only sm:hidden">Copy link</span>
      </Button>
      {fallback && (
        <div role="dialog" aria-label="Copy this link" className="absolute right-4 top-16 z-50 w-80 rounded-xl bg-white p-3 text-xs shadow-float ring-1 ring-line">
          <p className="mb-1 font-medium">Your browser blocked copying. Select the link and copy it:</p>
          <input readOnly autoFocus value={fallback} onFocus={(e) => e.target.select()} className="h-8 w-full rounded-lg border border-line px-2" aria-label="Chess link" />
          <button type="button" className="mt-2 underline" onClick={() => setFallback(null)}>Close</button>
        </div>
      )}
    </>
  );
}

function statusText(turn: 'w' | 'b', inCheck: boolean, outcome: Outcome | null, names: { w: string; b: string }) {
  if (outcome) {
    const who = outcome.result === '1-0' ? `${names.w} wins` : outcome.result === '0-1' ? `${names.b} wins` : 'Draw';
    return `${who} — ${TERMINATION_LABEL[outcome.termination]}`;
  }
  return `${turn === 'w' ? names.w : names.b} to move${inCheck ? ' — check!' : ''}`;
}

function MoveList({ sans }: { sans: string[] }) {
  const pairs = [];
  for (let i = 0; i < sans.length; i += 2) pairs.push([sans[i], sans[i + 1]]);
  return (
    <section aria-label="Move history" className="rounded-xl bg-white p-3 ring-1 ring-[#e8dcc6]">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Moves</h3>
      {sans.length === 0 ? <p className="text-xs text-neutral-500">No moves yet.</p> : (
        <ol className="atlas-scroll grid max-h-56 grid-cols-[2rem_1fr_1fr] gap-x-2 overflow-y-auto font-mono text-[13px]">
          {pairs.map(([w, b], i) => (
            <li key={i} className="contents"><span className="text-neutral-400">{i + 1}.</span><span>{w}</span><span>{b ?? ''}</span></li>
          ))}
        </ol>
      )}
    </section>
  );
}

function lastMoveOf(moves: string[]) {
  if (!moves.length) return null;
  const g = gameFrom(moves.slice(0, -1));
  const m = g.move(moves[moves.length - 1]);
  return m ? { from: m.from, to: m.to } : null;
}

function LocalChessGame() {
  const [params, setParams] = useSearchParams();
  const shared = useMemo(() => {
    const sans = parseChessMoves(params);
    return params.has('moves') ? (sans ? importLocalGame(sans) : 'invalid' as const) : null;
  }, [params]);
  const dropShared = () => setParams((p) => { p.delete('moves'); return p; }, { replace: true });
  const [state, setState] = useState<LocalChess>(() => loadLocalGame());
  const [flip, setFlip] = useState(false);
  const [confirm, setConfirm] = useState<'new' | 'resign' | 'draw' | null>(null);
  const g = useMemo(() => gameFrom(state.moves), [state.moves]);
  const update = (s: LocalChess) => { setState(s); saveLocalGame(s); };
  const turn = g.turn();
  const names = { w: 'White', b: 'Black' };
  const claim = !state.outcome && claimableDraw(g as never);
  const status = statusText(turn, g.inCheck(), state.outcome, names);

  const onMove = (m: BoardMove) => {
    const next = playLocal(state, m);
    if (next) update(next);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
      {shared && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-[#e8dcc6] lg:col-span-2">
          {shared === 'invalid' ? <span>This position link isn’t valid (a move in it is illegal or malformed).</span> : (
            <>
              <span className="min-w-0 flex-1">Someone shared a position with you ({shared.moves.length} moves). {state.moves.length ? 'Loading it replaces the game on this device.' : ''}</span>
              <Button size="sm" variant="cta" onClick={() => { update(shared); dropShared(); }}>Load position</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={dropShared}>Dismiss</Button>
        </div>
      )}
      <div className="space-y-2">
        <PlayerStrip name="Black" color="b" active={!state.outcome && turn === 'b'} />
        <ChessBoard fen={g.fen()} orientation={flip ? 'b' : 'w'} canMove={!state.outcome} onMove={onMove} lastMove={lastMoveOf(state.moves)} label="Local chessboard" />
        <PlayerStrip name="White" color="w" active={!state.outcome && turn === 'w'} />
      </div>
      <div className="space-y-3">
        <p role="status" aria-live="polite" className={cn('rounded-xl px-3 py-2 text-sm font-semibold', state.outcome ? 'bg-lime text-lime-ink' : g.inCheck() ? 'bg-danger-soft text-danger' : 'bg-white ring-1 ring-[#e8dcc6]')}>{status}</p>
        <p className="text-xs text-neutral-600">Two players, one device — take turns. This game is saved only in this browser and works offline.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<FlipVertical2 className="size-4" aria-hidden />} onClick={() => setFlip((f) => !f)}>Flip board</Button>
          {!state.outcome && <Button size="sm" icon={<Handshake className="size-4" aria-hidden />} onClick={() => setConfirm('draw')}>Agree a draw</Button>}
          {claim && <Button size="sm" variant="cta" onClick={() => { const n = claimLocalDraw(state); if (n) update(n); }}>Claim draw ({claim === 'fifty_move' ? 'fifty-move rule' : 'threefold repetition'})</Button>}
          {!state.outcome && <Button size="sm" icon={<Flag className="size-4" aria-hidden />} onClick={() => setConfirm('resign')}>{turn === 'w' ? 'White' : 'Black'} resigns</Button>}
          <Button size="sm" variant={state.outcome ? 'cta' : 'ghost'} icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => (state.moves.length && !state.outcome ? setConfirm('new') : update(newLocalGame()))}>New game</Button>
        </div>
        <MoveList sans={state.moves} />
      </div>
      <ConfirmDialog open={confirm === 'new'} title="Start a new game?" message="The current game will be discarded." confirmLabel="New game"
        onClose={() => setConfirm(null)} onConfirm={() => { update(newLocalGame()); setConfirm(null); }} />
      <ConfirmDialog open={confirm === 'resign'} danger title={`${turn === 'w' ? 'White' : 'Black'} resigns?`} message="The other player wins." confirmLabel="Resign"
        onClose={() => setConfirm(null)} onConfirm={() => { update({ ...state, outcome: { result: turn === 'w' ? '0-1' : '1-0', termination: 'resignation' } }); setConfirm(null); }} />
      <ConfirmDialog open={confirm === 'draw'} title="Both players agree to a draw?" message="The game ends as a draw." confirmLabel="Agree draw"
        onClose={() => setConfirm(null)} onConfirm={() => { update({ ...state, outcome: { result: '1/2-1/2', termination: 'draw_agreement' } }); setConfirm(null); }} />
    </div>
  );
}

function PlayerStrip({ name, color, active, userId }: { name: string; color: 'w' | 'b'; active: boolean; userId?: string }) {
  // Fixed height: the "To move" badge appearing must never nudge the board.
  return (
    <div className="flex h-7 items-center gap-2 text-sm">
      {userId ? <Avatar userId={userId} name={name} size="sm" /> : <span aria-hidden className={cn('size-6 rounded-full ring-2 ring-[#5b4632]', color === 'w' ? 'bg-white' : 'bg-[#1b1511]')} />}
      <span className="font-semibold">{name}</span>
      <span className="text-xs text-neutral-500">{color === 'w' ? 'White' : 'Black'}</span>
      {active && <span className="ml-auto rounded-full bg-[#5b4632] px-2 py-0.5 text-[11px] font-semibold text-white">To move</span>}
    </div>
  );
}

function OnlineChess({ gameId, venue }: { gameId?: string; venue: string | null }) {
  const { user, loading } = useAuth();
  const ws = useWorkspace();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (gameId && !isUuid(gameId)) return <ErrorMessage error="This chess link is malformed. Check that it was copied completely." />;
  if (!user || ws.local) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-2xl bg-white p-6 text-center ring-1 ring-[#e8dcc6]">
        <Wifi className="mx-auto size-8 text-[#5b4632]" aria-hidden />
        <p className="font-semibold">Online games need an account</p>
        <p className="text-sm text-neutral-600">Challenge friends or collaborators and play on separate devices. Moves are checked by the Atlas server. “Play here” works without an account.</p>
        {ws.mode === 'guest' && <Link to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`} className="inline-block text-sm font-medium text-brand underline">{gameId ? 'Sign in to open this game' : 'Sign in'}</Link>}
      </div>
    );
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div>{gameId ? <OnlineGameView id={gameId} me={user.id} /> : <p className="rounded-xl bg-white p-6 text-sm text-neutral-600 ring-1 ring-[#e8dcc6]">Choose a game on the right, or challenge someone.</p>}</div>
      <GameLobby me={user.id} venue={venue} current={gameId} />
    </div>
  );
}

function GameLobby({ me, venue, current }: { me: string; venue: string | null; current?: string }) {
  const games = useMyGames();
  const opponents = useOpponents(true);
  const actions = useChessActions();
  const toast = useToast();
  const navigate = useNavigate();
  const [opponent, setOpponent] = useState('');
  const [color, setColor] = useState<'white' | 'black' | 'random'>('random');
  const open = (id: string) => navigate(`/chess/${id}${venue ? `?venue=${encodeURIComponent(venue)}` : ''}`);
  const label = (g: OnlineGame) => `${g.white.id === me ? g.black.name : g.white.name}`;

  return (
    <div className="space-y-4">
      <form className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-[#e8dcc6]" aria-label="Challenge someone"
        onSubmit={(e) => {
          e.preventDefault();
          if (!opponent) return;
          actions.challenge.mutate({ opponent, color, venueRef: venue }, {
            onSuccess: (id) => { toast.success('Challenge sent.'); open(id); }, onError: (err) => toast.error(err),
          });
        }}>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Swords className="size-4" aria-hidden />Challenge someone</h3>
        {opponents.isLoading ? <Spinner /> : opponents.data?.length ? (
          <>
            <label className="block text-xs text-neutral-700">Opponent
              <select required value={opponent} onChange={(e) => setOpponent(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm">
                <option value="">Choose a friend or collaborator…</option>
                {opponents.data.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-neutral-700">You play
              <select value={color} onChange={(e) => setColor(e.target.value as typeof color)} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm">
                <option value="random">Random colour</option><option value="white">White</option><option value="black">Black</option>
              </select>
            </label>
            <Button size="sm" variant="cta" type="submit" loading={actions.challenge.isPending} disabled={!opponent}>Send challenge</Button>
          </>
        ) : <p className="text-xs text-neutral-600">Add friends (Settings → Friends) or join a collaboration map to find opponents.</p>}
      </form>

      <section aria-label="Your games" className="rounded-xl bg-white p-3 ring-1 ring-[#e8dcc6]">
        <h3 className="mb-2 text-sm font-semibold">Your games</h3>
        {games.isLoading ? <Spinner /> : games.error ? <ErrorMessage error={games.error} /> : !games.data?.length ? <p className="text-xs text-neutral-500">No games yet.</p> : (
          <ul className="space-y-1.5">
            {games.data.map((g) => {
              const incoming = g.status === 'invited' && g.createdBy !== me;
              const myTurn = g.status === 'active' && (g.fen.split(' ')[1] === 'w') === (g.white.id === me);
              return (
                <li key={g.id} className={cn('rounded-lg p-2 ring-1 ring-line', current === g.id && 'ring-2 ring-[#5b4632]')}>
                  <button type="button" className="flex w-full items-center gap-2 text-left text-sm" onClick={() => open(g.id)}>
                    <span className="min-w-0 flex-1 truncate">vs <span className="font-medium">{label(g)}</span> <span className="text-xs text-neutral-500">· you’re {g.white.id === me ? 'White' : 'Black'}</span></span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', myTurn ? 'bg-lime text-lime-ink' : 'bg-canvas text-neutral-600')}>
                      {g.status === 'active' ? (myTurn ? 'Your move' : 'Their move') : g.status === 'invited' ? (incoming ? 'Challenge' : 'Waiting') : g.status === 'finished' ? g.result : g.status}
                    </span>
                  </button>
                  {incoming && (
                    <div className="mt-1.5 flex gap-1.5">
                      <Button size="sm" variant="cta" onClick={() => actions.respond.mutate({ id: g.id, accept: true }, { onSuccess: () => open(g.id), onError: (e) => toast.error(e) })}>Accept</Button>
                      <Button size="sm" variant="ghost" onClick={() => actions.respond.mutate({ id: g.id, accept: false }, { onError: (e) => toast.error(e) })}>Decline</Button>
                    </div>
                  )}
                  {g.status === 'invited' && !incoming && (
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => actions.cancel.mutate(g.id, { onError: (e) => toast.error(e) })}>Cancel challenge</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function OnlineGameView({ id, me }: { id: string; me: string }) {
  const q = useGame(id);
  const actions = useChessActions(id);
  const toast = useToast();
  const [flip, setFlip] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const sans = useMemo(() => q.data?.moves.map((m) => m.san) ?? [], [q.data]);
  const g = useMemo(() => (q.data ? gameFrom(sans) : null), [q.data, sans]);

  if (q.isLoading) return <Spinner label="Loading game" />;
  if (q.error) return <ErrorMessage error={q.error} />;
  if (!q.data || !g) {
    return (
      <div className="space-y-2 rounded-xl bg-white p-4 text-sm ring-1 ring-[#e8dcc6]" role="alert">
        <p className="font-semibold">This game can’t be opened</p>
        <p className="text-neutral-600">It may have been deleted, or you aren’t one of its two players. Online games are visible only to the people playing them.</p>
        <Link to="/chess" className="font-medium text-brand underline">Back to your games</Link>
      </div>
    );
  }
  const { game } = q.data;
  const mine: 'w' | 'b' = game.white.id === me ? 'w' : 'b';
  const turn = g.turn();
  const outcome = game.result && game.termination ? { result: game.result, termination: game.termination } : null;
  const active = game.status === 'active';
  const myTurn = active && turn === mine;
  const orientation = flip ? (mine === 'w' ? 'b' : 'w') : mine;
  const top = orientation === 'w' ? game.black : game.white;
  const bottom = orientation === 'w' ? game.white : game.black;
  const claim = active && claimableDraw(g as never);
  const theirOffer = active && game.drawOfferedBy && game.drawOfferedBy !== me;
  const myOffer = active && game.drawOfferedBy === me;

  const onMove = (m: BoardMove) => actions.move.mutate({ expectedPly: game.ply, move: m }, { onError: (e) => toast.error(e) });
  const status = game.status === 'invited' ? (game.createdBy === me ? 'Waiting for your opponent to accept…' : 'You’ve been challenged — accept it in the list.')
    : game.status === 'declined' ? 'This challenge was declined.' : game.status === 'cancelled' ? 'This challenge was cancelled.'
      : statusText(turn, g.inCheck(), outcome, { w: game.white.name, b: game.black.name });

  return (
    <div className="space-y-2">
      <PlayerStrip name={top.name} userId={top.id} color={orientation === 'w' ? 'b' : 'w'} active={active && turn === (orientation === 'w' ? 'b' : 'w')} />
      <ChessBoard fen={g.fen()} orientation={orientation} canMove={myTurn && !actions.move.isPending} onMove={onMove} lastMove={lastMoveOf(sans)} label={`Online game against ${mine === 'w' ? game.black.name : game.white.name}`} />
      <PlayerStrip name={bottom.name} userId={bottom.id} color={orientation} active={active && turn === orientation} />
      <p role="status" aria-live="polite" className={cn('rounded-xl px-3 py-2 text-sm font-semibold', outcome ? 'bg-lime text-lime-ink' : g.inCheck() && active ? 'bg-danger-soft text-danger' : 'bg-white ring-1 ring-[#e8dcc6]')}>
        {actions.move.isPending ? 'Sending move…' : status}{active && !actions.move.isPending && (myTurn ? ' (your move)' : ' (waiting for opponent)')}
      </p>
      {theirOffer && (
        <div className="flex items-center gap-2 rounded-xl bg-white p-2 text-sm ring-1 ring-[#e8dcc6]">
          <Handshake className="size-4" aria-hidden />Your opponent offers a draw.
          <Button size="sm" variant="cta" onClick={() => actions.offerDraw.mutate(id, { onError: (e) => toast.error(e) })}>Accept</Button>
          <Button size="sm" variant="ghost" onClick={() => actions.declineDraw.mutate(id, { onError: (e) => toast.error(e) })}>Decline</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<FlipVertical2 className="size-4" aria-hidden />} onClick={() => setFlip((f) => !f)}>Flip board</Button>
        {active && !theirOffer && <Button size="sm" icon={<Handshake className="size-4" aria-hidden />} disabled={!!myOffer} onClick={() => actions.offerDraw.mutate(id, { onSuccess: () => toast.info('Draw offered.'), onError: (e) => toast.error(e) })}>{myOffer ? 'Draw offered' : 'Offer draw'}</Button>}
        {claim && <Button size="sm" variant="cta" onClick={() => actions.claimDraw.mutate(game.ply, { onError: (e) => toast.error(e) })}>Claim draw ({claim === 'fifty_move' ? 'fifty-move rule' : 'threefold repetition'})</Button>}
        {active && <Button size="sm" icon={<Flag className="size-4" aria-hidden />} onClick={() => setConfirmResign(true)}>Resign</Button>}
      </div>
      <MoveList sans={sans} />
      <ConfirmDialog open={confirmResign} danger title="Resign this game?" message="Your opponent wins." confirmLabel="Resign" busy={actions.resign.isPending}
        onClose={() => setConfirmResign(false)} onConfirm={() => actions.resign.mutate(id, { onSuccess: () => setConfirmResign(false), onError: (e) => toast.error(e) })} />
    </div>
  );
}
