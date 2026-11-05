// Restaura TODO el estado mutable de los mocks (se llama en afterEach desde setup.ts)
import { reiniciarDatos } from '../mocks/datos';
import { reiniciarDispensaciones } from '../mocks/handlers/dispensaciones';

export function reiniciarMocks(): void {
  // Arrays de datos.ts: lotes, existencias, prescripciones, dispensaciones, traslados y
  // MOVIMIENTOS (el kardex simulado lee ese array compartido)
  reiniciarDatos();
  // Estado privado de handlers: idempotencia de dispensaciones
  reiniciarDispensaciones();
}
