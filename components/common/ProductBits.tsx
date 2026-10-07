'use client';
import { useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProductImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {!err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Package className="h-1/3 w-1/3" /></div>
      )}
    </div>
  );
}

export function QtyStepper({ value, onChange, step = 1, min = 0, size = 'md', label = 'Quantity' }: { value: number; onChange: (v: number) => void; step?: number; min?: number; size?: 'sm' | 'md'; label?: string }) {
  const h = size === 'sm' ? 'h-8' : 'h-10';
  return (
    <div className={cn('inline-flex items-center rounded-md border bg-background', h)}>
      <button type="button" aria-label={`Decrease ${label}`} className={cn('px-3 text-lg leading-none text-muted-foreground hover:text-foreground disabled:opacity-40', h)} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input aria-label={label} inputMode="numeric" className={cn('w-14 border-x bg-transparent text-center text-sm tabular focus:outline-none', h)} value={value} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, '') || '0', 10); onChange(n); }} />
      <button type="button" aria-label={`Increase ${label}`} className={cn('px-3 text-lg leading-none text-muted-foreground hover:text-foreground', h)} onClick={() => onChange(value + step)}>+</button>
    </div>
  );
}
