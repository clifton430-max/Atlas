/**
 * "Welcome to Atlas" fade-in/fade-out on initial load/refresh only (it is
 * mounted once at the root, never on route changes). ~1.3 s total. It is
 * purely decorative: pointer-events are disabled and the app, auth and map
 * initialize underneath it in parallel. Reduced-motion users get a brief
 * static display instead of animation.
 */
import { AtlasMark } from '@/components/brand/AtlasMark';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export function WelcomeOverlay() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), reduce ? 700 : 950);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          aria-hidden
          data-testid="welcome-overlay"
          className="pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-neutral-50"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: 'easeOut' }}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex items-center gap-3"
          >
            <AtlasMark variant="tile" className="size-10 rounded-[11px] shadow-sm" />
            <span className="text-2xl font-semibold tracking-tight text-neutral-900">Welcome to Atlas</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
