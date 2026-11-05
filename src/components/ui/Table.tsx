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
  /** Clases extra por fila (p. ej. resaltar vencidos). Sustituye el hover por defecto. */
  claseFila?: (fila: T) => string;
}

export const ALINEAR = {
  izq: 'text-left',
  der: 'text-right tabular-nums',
  centro: 'text-center',
} as const;

/** Clases comunes para tablas hechas a mano: úsalas para que todas se vean iguales. */
export const CLASE_THEAD = 'bg-slate-100 text-xs tracking-wide text-slate-600 uppercase';
export const CLASE_TH = 'px-3 py-2 font-semibold whitespace-nowrap';
export const CLASE_TD = 'px-3 py-1.5';
/** `relative` evita que el `sr-only` del caption provoque scroll horizontal en móvil. */
export const CLASE_CONTENEDOR_TABLA =
  'relative overflow-x-auto rounded-md border border-slate-200 bg-white';

export function Table<T>({ columnas, filas, claveFila, titulo, vacio, claseFila }: TableProps<T>) {
  return (
    <div className={CLASE_CONTENEDOR_TABLA}>
      <table className="min-w-full text-sm">
        {titulo ? <caption className="sr-only">{titulo}</caption> : null}
        <thead className={CLASE_THEAD}>
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={`${CLASE_TH} ${ALINEAR[c.alinear ?? 'izq']}`}
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
              <tr key={claveFila(f)} className={claseFila?.(f) ?? 'hover:bg-slate-50'}>
                {columnas.map((c) => (
                  <td key={c.clave} className={`${CLASE_TD} ${ALINEAR[c.alinear ?? 'izq']}`}>
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
