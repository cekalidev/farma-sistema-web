// Tabla densa genérica
import type { Key, ReactNode } from 'react';

export interface Columna<T> {
  clave: string;
  titulo: ReactNode;
  celda: (fila: T) => ReactNode;
  alinear?: 'izq' | 'der' | 'centro';
}

interface TableProps<T> {
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => Key;
  /** Texto accesible de la tabla. */
  titulo?: string;
  vacio?: ReactNode;
}

const ALINEAR = {
  izq: 'text-left',
  der: 'text-right tabular-nums',
  centro: 'text-center',
} as const;

export function Table<T>({ columnas, filas, claveFila, titulo, vacio }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        {titulo ? <caption className="sr-only">{titulo}</caption> : null}
        <thead className="bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={`px-3 py-2 font-semibold ${ALINEAR[c.alinear ?? 'izq']}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.length === 0 ? (
            <tr>
              <td colSpan={columnas.length} className="px-3 py-6 text-center text-slate-500">
                {vacio ?? 'Sin resultados.'}
              </td>
            </tr>
          ) : (
            filas.map((f) => (
              <tr key={claveFila(f)} className="hover:bg-slate-50">
                {columnas.map((c) => (
                  <td key={c.clave} className={`px-3 py-1.5 ${ALINEAR[c.alinear ?? 'izq']}`}>
                    {c.celda(f)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
