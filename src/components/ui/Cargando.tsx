import { Spinner } from './Spinner';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 px-1 py-4 text-sm text-slate-600">
      <Spinner />
      <span>{texto}</span>
    </div>
  );
}
