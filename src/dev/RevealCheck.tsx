/** Dev-only: the reward reveal cards (Mythic vs Celestial) for visual checks. Not in production builds. */
import { Reveal } from '@/features/collectibles/CrateOpening';
import { Button } from '@/components/ui/Button';

export function RevealCheck() {
  const r = (defId: string, rarity: 'mythic' | 'celestial') => ({ rollId: 'x', defId, rarity, duplicate: false, copies: 1, rollsLeft: 2, replayed: false });
  return (
    <div className="grid min-h-full grid-cols-1 gap-6 bg-[#fbf3e2] p-6 md:grid-cols-3">
      <Reveal crate="monument" result={r('monument:farnese-atlas', 'celestial')}><Button size="sm" variant="cta">Place item</Button><Button size="sm" variant="secondary">Close / Later</Button></Reveal>
      <Reveal crate="skin" result={r('skin:atlas-of-the-heavens', 'celestial')}><Button size="sm" variant="cta">Equip or preview</Button><Button size="sm" variant="secondary">Close / Later</Button></Reveal>
      <Reveal crate="monument" result={r('monument:great-pyramid', 'mythic')}><Button size="sm" variant="cta">Place item</Button><Button size="sm" variant="secondary">Close / Later</Button></Reveal>
    </div>
  );
}
