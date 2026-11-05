// Invalidaciones compartidas tras operaciones que mueven stock
import type { QueryClient } from '@tanstack/react-query';
import { alertasKeys } from './endpoints/alertas';
import { inventarioKeys } from './endpoints/inventario';
import { kardexKeys } from './endpoints/kardex';

/**
 * Invalida inventario, kardex y alertas. Llamar tras dispensar, autorizar, despachar,
 * recibir, resolver discrepancias, ajustar o registrar entradas.
 */
export function invalidarStock(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: inventarioKeys.todo }),
    queryClient.invalidateQueries({ queryKey: kardexKeys.todo }),
    queryClient.invalidateQueries({ queryKey: alertasKeys.todo }),
  ]).then(() => undefined);
}
