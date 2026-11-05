import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { establecerToken } from '../../api/client';
import { crearDispensacion } from '../../api/endpoints/dispensaciones';
import { DISPENSACIONES, USUARIOS } from '../../mocks/datos';
import { reiniciarDispensaciones } from '../../mocks/handlers/dispensaciones';
import { server } from '../../mocks/server';
import { api, errorApi, tokenMock } from '../../mocks/utilidades';
import { renderConProveedores } from '../../test/render';
import PantallaDispensacion from '.';
import { TEXTO_SEGREGACION } from './PanelPendientes';

const regente2 = USUARIOS.find((x) => x.email === 'regente2@farma.test');

/** Crea una pendiente (MORF10) registrada por el regente 1. */
async function pendienteDelRegente(): Promise<number> {
  establecerToken(tokenMock('regente@farma.test'));
  const { dispensacion } = await crearDispensacion(
    {
      paciente_id: 3,
      prescripcion_id: 3,
      bodega_id: 1,
      items: [{ prescripcion_item_id: 31, cantidad: 1 }],
    },
    'clave-test',
  );
  return dispensacion.id;
}

const fila = (id: number) => screen.findByRole('listitem', { name: `Dispensación #${id}` });

beforeEach(() => reiniciarDispensaciones());

describe('pendientes de autorización', () => {
  it('el regente creador ve los botones deshabilitados con la explicación', async () => {
    const id = await pendienteDelRegente();
    renderConProveedores(<PantallaDispensacion />, { rol: 'regente_farmacia' });
    const propia = await fila(id);
    expect(within(propia).getByText('Tú')).toBeInTheDocument();
    expect(within(propia).getByRole('button', { name: 'Autorizar' })).toBeDisabled();
    expect(within(propia).getByRole('button', { name: 'Rechazar' })).toBeDisabled();
    expect(within(propia).getByText(TEXTO_SEGREGACION)).toBeInTheDocument();
    // La del auxiliar (seed #1) sí se puede autorizar
    const ajena = await fila(1);
    expect(within(ajena).getByRole('button', { name: 'Autorizar' })).toBeEnabled();
    expect(within(ajena).getByText('usuario #1')).toBeInTheDocument();
  });

  it('otro regente autoriza: queda confirmada con lotes', async () => {
    const id = await pendienteDelRegente();
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, regente2 ? { usuario: regente2 } : {});
    await u.click(within(await fila(id)).getByRole('button', { name: 'Autorizar' }));
    expect(
      await screen.findByText(`Dispensación #${id} autorizada. Lotes asignados:`),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Lotes de Morfina 10 mg/mL' })).toHaveTextContent(
      'MORF10-A',
    );
    expect(DISPENSACIONES.find((d) => d.id === id)?.estado).toBe('CONFIRMADA');
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: `Dispensación #${id}` }),
      ).not.toBeInTheDocument(),
    );
  });

  it('rechazar exige un motivo de al menos 10 caracteres', async () => {
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'regente_farmacia' });
    await u.click(within(await fila(1)).getByRole('button', { name: 'Rechazar' }));
    const dialogo = await screen.findByRole('dialog');
    await u.type(within(dialogo).getByLabelText('Motivo'), 'corto{Enter}');
    expect(within(dialogo).getByText('Escribe al menos 10 caracteres.')).toBeInTheDocument();
    expect(DISPENSACIONES[0]?.estado).toBe('PENDIENTE_AUTORIZACION');
    await u.type(within(dialogo).getByLabelText('Motivo'), ' la dosis no coincide{Enter}');
    expect(
      await screen.findByText('No hay dispensaciones pendientes de autorización.'),
    ).toBeInTheDocument();
    expect(DISPENSACIONES[0]).toMatchObject({
      estado: 'RECHAZADA',
      rechazado_por_id: 2,
      motivo_rechazo: 'corto la dosis no coincide',
    });
  });

  it('un 403 AUTORIZACION_MISMO_USUARIO se explica en la fila', async () => {
    server.use(
      http.post(api('/dispensaciones/:id/autorizar'), () =>
        errorApi(403, 'AUTORIZACION_MISMO_USUARIO', 'x', { dispensacion_id: 1 }),
      ),
    );
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'regente_farmacia' });
    const f = await fila(1);
    await u.click(within(f).getByRole('button', { name: 'Autorizar' }));
    expect(await within(f).findByRole('alert')).toHaveTextContent('Debe hacerlo otro regente.');
  });
});
