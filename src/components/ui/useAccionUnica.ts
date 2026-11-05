// Bloquea el doble disparo de una acción asíncrona (ref síncrono, no espera al re-render)
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface AccionUnica<A extends unknown[], R> {
  /** Ejecuta la acción; si ya hay una en curso devuelve undefined sin llamar. */
  ejecutar: (...args: A) => Promise<R | undefined>;
  pendiente: boolean;
}

export function useAccionUnica<A extends unknown[], R>(
  accion: (...args: A) => Promise<R>,
): AccionUnica<A, R> {
  const enCurso = useRef(false);
  const accionRef = useRef(accion);
  const [pendiente, setPendiente] = useState(false);

  useLayoutEffect(() => {
    accionRef.current = accion;
  });

  const ejecutar = useCallback(async (...args: A): Promise<R | undefined> => {
    if (enCurso.current) return undefined;
    enCurso.current = true;
    setPendiente(true);
    try {
      return await accionRef.current(...args);
    } finally {
      enCurso.current = false;
      setPendiente(false);
    }
  }, []);

  return { ejecutar, pendiente };
}
