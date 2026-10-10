/**
 * Link sharing widget: real QR code (encodes the exact URL), Copy Link
 * fallback that always works, and the native share sheet where supported.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Share } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export function ShareLink({ url, title, text }: { url: string; title: string; text: string }) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { margin: 1, width: 192, errorCorrectionLevel: 'M', color: { dark: '#171717', light: '#ffffff' } })
      .then((d) => active && setQr(d))
      .catch(() => active && setQr(null));
    return () => { active = false; };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      // Clipboard API can be blocked; fall back to selecting the field.
      const el = document.getElementById('share-link-field') as HTMLInputElement | null;
      el?.select();
      toast.info('Press Ctrl/Cmd+C to copy the selected link.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error('Sharing failed. Use Copy link instead.');
    }
  };

  return (
    <div className="flex gap-4">
      <div className="grid size-[148px] shrink-0 place-items-center rounded-xl bg-white ring-1 ring-neutral-200">
        {qr ? <img src={qr} alt={`QR code for ${url}`} className="size-[136px]" /> : <span className="text-xs text-neutral-400">QR unavailable</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <label className="block text-xs font-medium text-neutral-700" htmlFor="share-link-field">Link</label>
        <input id="share-link-field" readOnly value={url} onFocus={(e) => e.target.select()}
          className="h-9 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-2 font-mono text-xs" />
        <div className="flex gap-2">
          <Button size="sm" variant="primary" icon={<Copy className="size-3.5" aria-hidden />} onClick={copy}>Copy link</Button>
          {canNativeShare && <Button size="sm" icon={<Share className="size-3.5" aria-hidden />} onClick={share}>Share…</Button>}
        </div>
      </div>
    </div>
  );
}
