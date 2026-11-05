import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Button } from './Button';
import { Dialogo } from './Dialogo';
import { DialogoConfirmar } from './DialogoConfirmar';
import { DialogoMotivo } from './DialogoMotivo';

function ConDialogo() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)}>Abrir</button>
      <Dialogo
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Título del diálogo"
        descripcion="Texto de apoyo"
        acciones={<Button onClick={() => setAbierto(false)}>Cerrar</Button>}
      >
        <input aria-label="Dato" />
      </Dialogo>
    </>
  );
}

describe('Dialogo', () => {
  it('abre con nombre y descripción, enfoca el primer control y devuelve el foco (StrictMode)', async () => {
    const usuario = userEvent.setup();
    render(
      <StrictMode>
        <ConDialogo />
      </StrictMode>,
    );
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await usuario.click(abrir);
    const dialogo = screen.getByRole('dialog', { name: 'Título del diálogo' });
    expect(dialogo).toHaveAccessibleDescription('Texto de apoyo');
    expect(screen.getByLabelText('Dato')).toHaveFocus();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it('bloquearCierre ignora Escape', async () => {
    const onCerrar = vi.fn();
    const usuario = userEvent.setup();
    render(
      <Dialogo abierto onCerrar={onCerrar} titulo="Guardando" bloquearCierre>
        <button>Algo</button>
      </Dialogo>,
    );
    await usuario.keyboard('{Escape}');
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

function ConMotivo({ onConfirmar }: { onConfirmar: (m: string) => Promise<unknown> }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)}>Rechazar</button>
      <DialogoMotivo
        abierto={abierto}
        titulo="Rechazar dispensación"
        onConfirmar={onConfirmar}
        onCerrar={() => setAbierto(false)}
      />
    </>
  );
}

describe('DialogoMotivo', () => {
  it('cada apertura empieza vacía (no arrastra el motivo anterior)', async () => {
    const usuario = userEvent.setup();
    const onConfirmar = vi.fn(() => Promise.resolve());
    render(<ConMotivo onConfirmar={onConfirmar} />);
    await usuario.click(screen.getByRole('button', { name: 'Rechazar' }));
    const area = screen.getByRole('textbox', { name: 'Motivo' });
    expect(area).toHaveFocus();
    await usuario.type(area, 'Motivo del primer rechazo');
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    await usuario.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(screen.getByRole('textbox', { name: 'Motivo' })).toHaveValue('');
    await usuario.type(
      screen.getByRole('textbox', { name: 'Motivo' }),
      'Otro motivo distinto{Enter}',
    );
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith('Otro motivo distinto'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('muestra el error del servidor y lo limpia al reabrir', async () => {
    const usuario = userEvent.setup();
    const onConfirmar = vi.fn(() => Promise.reject(new Error('x')));
    render(<ConMotivo onConfirmar={onConfirmar} />);
    await usuario.click(screen.getByRole('button', { name: 'Rechazar' }));
    await usuario.type(screen.getByRole('textbox', { name: 'Motivo' }), 'Motivo suficiente{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/error inesperado/);
    await usuario.keyboard('{Escape}');
    await usuario.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DialogoConfirmar', () => {
  it('peligro: foco inicial en Cancelar; confirmar llama a onConfirmar', async () => {
    const usuario = userEvent.setup();
    const onConfirmar = vi.fn();
    render(
      <DialogoConfirmar
        abierto
        titulo="Anular traslado"
        texto="Se liberará la reserva."
        variante="peligro"
        etiquetaConfirmar="Anular"
        onConfirmar={onConfirmar}
        onCerrar={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await usuario.click(screen.getByRole('button', { name: 'Anular' }));
    expect(onConfirmar).toHaveBeenCalledOnce();
  });
});

describe('Button pending', () => {
  it('aria-disabled y aria-busy, sigue enfocable y no dispara onClick', async () => {
    const usuario = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Guardar
      </Button>,
    );
    const boton = screen.getByRole('button', { name: 'Guardar' });
    expect(boton).not.toHaveAttribute('disabled');
    expect(boton).toHaveAttribute('aria-disabled', 'true');
    expect(boton).toHaveAttribute('aria-busy', 'true');
    await usuario.tab();
    expect(boton).toHaveFocus();
    await usuario.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('pending en submit no envía el formulario', async () => {
    const usuario = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" pending>
          Enviar
        </Button>
      </form>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disabled explícito sigue usando disabled', () => {
    render(<Button disabled>Nada</Button>);
    expect(screen.getByRole('button', { name: 'Nada' })).toBeDisabled();
  });
});
