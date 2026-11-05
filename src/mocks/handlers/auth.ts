// Auth (existe en el backend)
import { http, HttpResponse, type HttpHandler } from 'msw';
import { CONTRASENA_DEMO, USUARIOS } from '../datos';
import { api, autorizar, errorApi, tokenMock } from '../utilidades';

export const handlersReales: HttpHandler[] = [
  http.post(api('/auth/login'), async ({ request }) => {
    const cuerpo = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
    } | null;
    const email = typeof cuerpo?.email === 'string' ? cuerpo.email : '';
    const password = typeof cuerpo?.password === 'string' ? cuerpo.password : '';
    if (!email || !password) {
      return errorApi(422, 'VALIDACION', 'Los datos enviados no son válidos.', {
        campos: {
          ...(email ? {} : { email: ['The email field is required.'] }),
          ...(password ? {} : { password: ['The password field is required.'] }),
        },
      });
    }
    const u = USUARIOS.find((x) => x.email === email.toLowerCase());
    if (!u || password !== CONTRASENA_DEMO) {
      return errorApi(401, 'CREDENCIALES_INVALIDAS', 'Credenciales inválidas.');
    }
    return HttpResponse.json({
      token: tokenMock(u.email),
      token_type: 'Bearer',
      expira_en_minutos: 480,
      rol: u.rol,
      usuario: u,
    });
  }),

  http.get(api('/auth/me'), ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    return HttpResponse.json({ data: u });
  }),

  http.post(api('/auth/logout'), ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    return new HttpResponse(null, { status: 204 });
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
