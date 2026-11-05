import type { ReactNode } from 'react';

export function EstadoVacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
      <p className="font-medium text-slate-700">{titulo}</p>
      {children ? <div className="mt-1 text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}
