// Inicio de sesión
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router';
import { z } from 'zod';
import { esApiError } from '../../api/client';
import { aplicarErroresAlFormulario } from '../../api/errores';
import { rutaInicio } from '../../auth/permisos';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Field, Input } from '../../components/ui/Field';
import { useAccionUnica } from '../../components/ui/useAccionUnica';

const esquema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo.').pipe(z.email('Correo no válido.')),
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

type Credenciales = z.infer<typeof esquema>;

// Solo en desarrollo: usuarios sintéticos de la semilla
const USUARIOS_DEMO = import.meta.env.DEV
  ? [
      ['auxiliar@farma.test', 'Auxiliar'],
      ['regente@farma.test', 'Regente'],
      ['regente2@farma.test', 'Regente 2'],
      ['auditor@farma.test', 'Auditor'],
      ['medico@farma.test', 'Médico'],
      ['admin@farma.test', 'Admin'],
    ]
  : [];
const CONTRASENA_DEMO = import.meta.env.DEV ? 'Farma2026!' : '';

interface EstadoNavegacion {
  desde?: Location;
}

function destinoTrasLogin(estado: unknown, inicio: string | null): string {
  const desde = (estado as EstadoNavegacion | null)?.desde;
  if (desde && desde.pathname !== '/login') return `${desde.pathname}${desde.search}${desde.hash}`;
  return inicio ?? '/';
}

export default function PantallaLogin() {
  const { usuario, aviso, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError: setErrorCampo,
    formState: { errors },
  } = useForm<Credenciales>({
    resolver: zodResolver(esquema),
    defaultValues: { email: '', password: '' },
  });

  const enviar = useAccionUnica(async (datos: Credenciales) => {
    setError(null);
    try {
      const u = await iniciarSesion(datos.email, datos.password);
      void navigate(destinoTrasLogin(location.state, rutaInicio(u)), { replace: true });
    } catch (e) {
      const conCampos =
        esApiError(e) && e.codigo === 'VALIDACION' && aplicarErroresAlFormulario(e, setErrorCampo);
      if (!conCampos) setError(e);
    }
  });

  // Ya autenticado (p. ej. recarga en /login): al inicio
  if (usuario && !enviar.pendiente) {
    return <Navigate to={destinoTrasLogin(location.state, rutaInicio(usuario))} replace />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-marca-800">FARTMAR IPS · Farmacia</h1>
        <p className="mb-4 text-sm text-slate-600">Inicia sesión para continuar.</p>

        {aviso && !error ? (
          <p
            role="status"
            className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {aviso}
          </p>
        ) : null}

        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => void handleSubmit((d) => enviar.ejecutar(d))(e)}
        >
          <Field label="Correo" error={errors.email?.message}>
            <Input type="email" autoComplete="username" autoFocus {...register('email')} />
          </Field>
          <Field label="Contraseña" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...register('password')} />
          </Field>

          {error ? <ErrorBanner error={error} /> : null}

          <Button type="submit" pending={enviar.pendiente} className="mt-1 w-full">
            Ingresar
          </Button>
        </form>

        {USUARIOS_DEMO.length > 0 ? (
          <details className="mt-4 text-xs text-slate-500">
            <summary className="cursor-pointer select-none">Usuarios de demostración</summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {USUARIOS_DEMO.map(([email, etiqueta]) => (
                <button
                  key={email}
                  type="button"
                  className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
                  onClick={() => {
                    setValue('email', email ?? '', { shouldValidate: true });
                    setValue('password', CONTRASENA_DEMO, { shouldValidate: true });
                  }}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
