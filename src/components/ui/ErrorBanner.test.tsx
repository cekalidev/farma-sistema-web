import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '../../api/client';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('muestra el código de seguimiento si el error lo trae', () => {
    const error = new ApiError({
      status: 500,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Server error',
      correlacionId: '3f2c9a1e-5b7d-4c11-9e0f-2a6b8c4d1e70',
    });
    render(<ErrorBanner error={error} />);
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Código de seguimiento: 3f2c9a1e-5b7d-4c11-9e0f-2a6b8c4d1e70');
    expect(screen.getByText('3f2c9a1e-5b7d-4c11-9e0f-2a6b8c4d1e70')).toHaveClass('select-all');
  });

  it('sin cabecera no muestra la línea de seguimiento', () => {
    render(<ErrorBanner error={new ApiError({ status: 0, codigo: 'RED', mensaje: 'x' })} />);
    expect(screen.queryByText(/Código de seguimiento/)).not.toBeInTheDocument();
  });
});
