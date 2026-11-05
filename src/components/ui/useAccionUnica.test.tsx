import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Button } from './Button';
import { useAccionUnica } from './useAccionUnica';

function Boton({ accion }: { accion: () => Promise<void> }) {
  const { ejecutar, pendiente } = useAccionUnica(accion);
  return (
    <Button pending={pendiente} onClick={() => void ejecutar()}>
      Confirmar
    </Button>
  );
}

describe('useAccionUnica + Button', () => {
  it('dos clics en el mismo tick lanzan una sola petición', async () => {
    let resolver: () => void = () => {};
    const accion = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolver = r;
        }),
    );
    render(<Boton accion={accion} />);
    const boton = screen.getByRole('button', { name: 'Confirmar' });
    // Dos clics síncronos antes de cualquier re-render
    act(() => {
      boton.click();
      boton.click();
    });
    expect(accion).toHaveBeenCalledTimes(1);
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolver());
    expect(boton).toBeEnabled();
  });

  it('permite un nuevo envío al terminar (también si falla)', async () => {
    const usuario = userEvent.setup();
    const accion = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    function ConError() {
      const { ejecutar } = useAccionUnica(accion);
      return <Button onClick={() => void ejecutar().catch(() => {})}>Enviar</Button>;
    }
    render(<ConError />);
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(accion).toHaveBeenCalledTimes(2);
  });
});
