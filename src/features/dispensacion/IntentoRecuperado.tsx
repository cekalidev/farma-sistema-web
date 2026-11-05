// Envío con resultado incierto que sobrevivió a una recarga: se reintenta con la MISMA clave
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { crearDispensacion, dispensacionesKeys } from '../../api/endpoints/dispensaciones';
import { esResultadoIncierto } from '../../api/errores';
import { invalidarStock } from '../../api/invalidaciones';
import { Button } from '../../components/ui/Button';
import { DialogoConfirmar } from '../../components/ui/DialogoConfirmar';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { TEXTO_DESCARTAR } from './FlujoDispensacion';
import { borrarIntento, type IntentoPendiente } from './logica';
import { Resultado, type ResultadoDispensacion } from './Resultado';

interface Props {
  intento: IntentoPendiente;
  onPendienteCreada: (id: number) => void;
  /** Resuelto (registrado, descartado o rechazado con 4xx): se quita el aviso. */
  onCerrar: () => void;
}

export function IntentoRecuperado({ intento, onPendienteCreada, onCerrar }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [resultado, setResultado] = useState<ResultadoDispensacion | null>(null);
  const [descartando, setDescartando] = useState(false);
  const unidades = intento.cuerpo.items.reduce((s, i) => s + i.cantidad, 0);

  const reintentar = useAccionUnica(async () => {
    setError(null);
    try {
      const r = await crearDispensacion(intento.cuerpo, intento.clave);
      borrarIntento();
      setResultado(r);
      if (r.dispensacion.estado === 'PENDIENTE_AUTORIZACION') onPendienteCreada(r.dispensacion.id);
      void queryClient.invalidateQueries({ queryKey: dispensacionesKeys.todo });
      void invalidarStock(queryClient);
    } catch (e) {
      // Un 4xx dice con certeza que no se registró: el intento queda resuelto
      if (!esResultadoIncierto(e)) borrarIntento();
      setError(e);
    }
  });

  if (resultado) return <Resultado {...resultado} onNueva={onCerrar} />;

  const resuelto = error !== null && !esResultadoIncierto(error);

  return (
    <section
      aria-labelledby="titulo-intento"
      className="flex flex-col gap-2 rounded-lg border border-amber-400 bg-amber-50 p-4"
    >
      <h2 id="titulo-intento" className="text-sm font-semibold text-amber-900">
        Hay una dispensación sin confirmar
      </h2>
      <p className="text-sm text-amber-900">
        Prescripción #{intento.cuerpo.prescripcion_id} · {intento.cuerpo.items.length} ítem(s),{' '}
        <span className="tabular-nums">{unidades}</span> und. No se supo si el servidor la registró.
        Reintentar es seguro: no se duplicará.
      </p>
      {error ? (
        <ErrorBanner
          error={error}
          titulo={resuelto ? 'No se registró la dispensación' : 'Sigue sin confirmarse'}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {resuelto ? (
          <Button variante="secundario" onClick={onCerrar}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button pending={reintentar.pendiente} onClick={() => void reintentar.ejecutar()}>
              Reintentar
            </Button>
            <Button
              variante="peligroSecundario"
              disabled={reintentar.pendiente}
              onClick={() => setDescartando(true)}
            >
              Descartar y empezar de nuevo
            </Button>
          </>
        )}
      </div>
      <DialogoConfirmar
        abierto={descartando}
        titulo="¿Descartar la dispensación sin confirmar?"
        texto={TEXTO_DESCARTAR}
        etiquetaConfirmar="Descartar"
        variante="peligro"
        onConfirmar={() => {
          borrarIntento();
          setDescartando(false);
          onCerrar();
        }}
        onCerrar={() => setDescartando(false)}
      />
    </section>
  );
}
