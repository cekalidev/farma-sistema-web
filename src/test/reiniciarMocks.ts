// Restaura TODO el estado mutable de los mocks (se llama en afterEach desde setup.ts)
import { reiniciarDatos } from '../mocks/datos';
import { reiniciarDispensaciones } from '../mocks/handlers/dispensaciones';
import { reiniciarKardex } from '../mocks/handlers/kardex';

export function reiniciarMocks(): void {
  // Arrays de datos.ts: lotes, existencias, prescripciones, dispensaciones, traslados, MOVIMIENTOS
  reiniciarDatos();
  // Estado privado de handlers: kardex propio (hasta que use MOVIMIENTOS) e idempotencia
  reiniciarKardex();
  reiniciarDispensaciones();
}
