# farma-sistema-web

SPA en React para la prueba técnica FARTMAR: dispensación de medicamentos, inventario y traslados entre bodegas, sobre la API Laravel del repositorio `farma-sistema`.

Pantallas: **Login**, **Dispensación**, **Traslados**, **Inventario** y **Kardex**. Roles con pantallas: `auxiliar_farmacia`, `regente_farmacia` y `auditor` (solo lectura). `medico` y `admin` pueden iniciar sesión, pero no tienen pantallas en este módulo.

## Arranque rápido

Requisitos: Node ≥ 26 y pnpm 12.

```sh
pnpm install
```

**Demo sin backend.** MSW simula toda la API en el navegador:

```sh
VITE_API_MOCKS=todo pnpm dev
```

Usuarios de la demo (datos sintéticos de desarrollo, no existen fuera de los mocks), todos con la contraseña `Farma2026!`:

| Usuario               | Rol                              |
| --------------------- | -------------------------------- |
| `auxiliar@farma.test` | Auxiliar de farmacia             |
| `regente@farma.test`  | Regente de farmacia              |
| `regente2@farma.test` | Segundo regente (autorizaciones) |
| `auditor@farma.test`  | Auditor (solo lectura)           |

**Contra el backend real.** Con la API escuchando en `http://localhost:8000`:

```sh
pnpm dev
```

El proxy de Vite reenvía `/api` a `VITE_PROXY_TARGET` (por defecto `http://localhost:8000`). Para cambiarlo, copia `.env.example` a `.env` y edítalo.

**Docker.** Construye la imagen y sirve la SPA con Nginx en `http://localhost:8080`:

```sh
docker compose up --build
```

Con Podman: `podman compose up --build`, o a mano:

```sh
podman build --format docker -t farma-sistema-web .
podman run -p 8080:8080 -e API_UPSTREAM=http://host.containers.internal:8000 farma-sistema-web
```

`--format docker` hace falta para que Podman conserve el `HEALTHCHECK`. `API_UPSTREAM` indica dónde está la API (sin barra final) y `WEB_PORT` el puerto publicado en el host.

El arranque de todo el sistema en un solo comando (base de datos, API y web) vive en el `compose.yaml` del backend, que es quien define la base de datos y la API. Aquí está el servicio `web` listo para integrarse: basta con apuntar `API_UPSTREAM` a `http://api:8000` y activar el `depends_on` con `condition: service_healthy` que ya está comentado en `compose.yaml`.

## Scripts

| Comando                | Qué hace                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm dev`             | Servidor de desarrollo con proxy a la API                      |
| `pnpm build`           | Build de producción en `dist/`                                 |
| `pnpm test`            | Tests con Vitest (jsdom)                                       |
| `pnpm run check`       | Formato (Oxfmt), lint (Oxlint) y tipos                         |
| `pnpm run lint:eslint` | ESLint con reglas de React Hooks                               |
| `pnpm run typecheck`   | `tsc --noEmit`                                                 |
| `pnpm run verify`      | Todo lo anterior en orden: check, ESLint, tipos, tests y build |

## Variables de entorno

| Variable            | Dónde se usa       | Valor por defecto                      | Descripción                                                                                                                                                 |
| ------------------- | ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`      | Build (bundle)     | `/api/v1`                              | Base de la API. Relativa para usar el mismo origen.                                                                                                         |
| `VITE_API_MOCKS`    | Build (bundle)     | `no`                                   | `no`: backend real. `todo`: MSW simula toda la API.                                                                                                         |
| `VITE_PROXY_TARGET` | `pnpm dev`         | `http://localhost:8000`                | Destino del proxy `/api` de Vite.                                                                                                                           |
| `API_UPSTREAM`      | Contenedor (Nginx) | `http://host.containers.internal:8000` | Destino del proxy `/api` de Nginx, sin barra final. Se lee al arrancar. La imagen sola usa `http://api:8000`; el valor por defecto es el de `compose.yaml`. |
| `WEB_PORT`          | `compose.yaml`     | `8080`                                 | Puerto publicado en el host.                                                                                                                                |

Las variables `VITE_*` quedan incrustadas en el bundle: nunca deben llevar secretos.

## Arquitectura

```text
src/
├── api/          cliente HTTP, tipos del contrato, endpoints y mapa de errores
├── app/          router, layout, guardas de sesión y de permisos, providers
├── auth/         sesión (token y /auth/me) y permisos por habilidad
├── components/ui botones, tablas, diálogos, banners de error, useAccionUnica
├── features/     una carpeta por pantalla: login, dispensacion, traslados, inventario, kardex
├── lib/          fechas en America/Bogota, UUID, configuración de Zod
├── mocks/        handlers MSW y datos sintéticos que imitan el contrato
└── test/         setup de Vitest y utilidades de render
```

Flujo de datos: **endpoint tipado → TanStack Query → pantalla**. Cada archivo de `src/api/endpoints/` expone funciones tipadas (`listarTraslados`, `crearDispensacion`…) y sus claves de caché. Las pantallas las usan con `useQuery` o `useMutation` y nunca llaman a `fetch` directamente. Tras una operación que mueve stock, `invalidarStock` refresca inventario, kardex y alertas.

Los mocks interceptan la red (MSW), no el código: con `VITE_API_MOCKS=no` las mismas funciones hablan con el backend real sin tocar ninguna pantalla. Si un endpoint real difiere del mock, solo se ajusta la capa de API (`src/api/endpoints/*` y `src/api/tipos.ts`) y el handler correspondiente.

## Decisiones de diseño y trade-offs

**1. Vite+ (Oxfmt, Oxlint, Vitest) y además un ESLint mínimo.**
Por qué: Vite+ da formato, lint con tipos, tests y build con una sola herramienta y muy rápido. El enunciado pide ESLint en el pipeline, así que se añade con `typescript-eslint` y las reglas de React Hooks. Qué se sacrifica: dos linters que mantener y una herramienta joven con menos documentación que el ecosistema clásico.

**2. SPA servida por Nginx con proxy `/api` en el mismo origen.**
Por qué: el backend no expone `Retry-After` ni `Idempotent-Replayed` por CORS; en el mismo origen el navegador puede leerlas, y no hace falta configurar CORS. Qué se sacrifica: el frontend depende de un proxy (Vite en desarrollo, Nginx en el contenedor) y no puede desplegarse en un CDN estático puro sin reconfigurar.

**3. Token en `sessionStorage`.**
Por qué: sobrevive a recargar la página y se borra al cerrar la pestaña. La API usa tokens Bearer; una cookie httpOnly exigiría cambiar el backend. Qué se sacrifica: un XSS podría leer el token. Se mitiga con una CSP estricta (`script-src 'self'`) y sin HTML inyectado. Guardarlo solo en memoria obligaría a iniciar sesión en cada recarga.

**4. Idempotency-Key por intento, ligada al cuerpo.**
Por qué: `crearGestorClave` (`src/features/dispensacion/logica.ts`) genera una clave por intento, la reutiliza si se reintenta el mismo cuerpo y crea una nueva si el cuerpo cambia. Un reintento tras un corte de red no duplica la dispensación. Ante un resultado incierto (sin respuesta o 5xx) el formulario se congela hasta consultar el estado. Qué se sacrifica: más estado en el cliente y un flujo más rígido; el usuario no puede editar y reenviar a ciegas.

**5. Doble clic bloqueado con un ref síncrono (`useAccionUnica`).**
Por qué: el estado `pendiente` de React solo cambia tras el siguiente render, y dos clics rápidos pueden entrar antes. Un `useRef` se marca de forma síncrona. Qué se sacrifica: un hook propio en lugar de confiar solo en `isPending` de TanStack Query.

**6. Permisos por habilidades, no por nombre de rol.**
Por qué: `/auth/me` devuelve las habilidades del usuario (`dispensacion.crear`, `traslado.consultar`…) y la UI decide con ellas qué secciones y botones mostrar. Si el backend cambia un rol, la UI lo sigue. La autoridad sigue siendo el backend (Policies). Qué se sacrifica: algunas reglas finas (“no el creador”, “no el solicitante”) se replican en la UI para explicar por qué un botón está deshabilitado, y deben mantenerse alineadas con las Policies.

**7. Mensajes por `codigo`, nunca el texto crudo del backend.**
Por qué: `src/api/errores.ts` traduce cada `codigo` del contrato a un mensaje en español. Los mensajes de validación de Laravel llegan en inglés y pueden repetir datos personales del paciente. Qué se sacrifica: un código nuevo del backend muestra un mensaje genérico hasta que se añade al mapa.

**8. Máquina de estados del traslado en una función pura.**
Por qué: `src/features/traslados/acciones.ts` calcula qué acciones ve cada usuario según estado, rol y autoría, y se prueba sin renderizar. Qué se sacrifica: duplica parte de la lógica de estados del backend.

**9. “Hoy” calculado en America/Bogota.**
Por qué: el backend decide vencimientos con la fecha de negocio de Bogotá. Con la zona del navegador, un lote podría verse vigente en la UI y ser rechazado por la API. Qué se sacrifica: un usuario en otra zona horaria ve fechas de negocio, no locales.

**10. MSW con solo dos modos: `todo` y `no`.**
Por qué: la demo funciona sin backend y los tests usan los mismos handlers. Mezclar datos simulados con escrituras reales producía ids inconsistentes. Qué se sacrifica: no se puede simular solo un endpoint que falte en el backend; hay que elegir todo o nada.

## Librerías relevantes

| Librería                | Por qué                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| React 19                | Requisito del enunciado.                                                                               |
| TanStack Query 5        | Caché, reintentos, invalidación tras mutaciones y estados de carga sin escribirlos a mano.             |
| React Router 7          | Rutas anidadas con guardas de sesión y permisos, y carga diferida por pantalla.                        |
| React Hook Form + Zod 4 | Formularios con validación tipada. Zod corre en modo `jitless` porque la CSP no permite `unsafe-eval`. |
| Tailwind CSS 4          | Estilos sin hojas de CSS por componente; plugin de Vite sin configuración extra.                       |
| sonner                  | Avisos (toasts) accesibles para confirmar operaciones.                                                 |
| MSW 3                   | Mocks a nivel de red: la demo y los tests usan la misma capa de API que producción.                    |
| Testing Library + jsdom | Tests de componentes desde el punto de vista del usuario (roles, textos, clics).                       |

## Seguridad y privacidad (RN-10)

- Datos de pacientes del auditor: se muestran tal como los entrega la API (enmascarados) con el distintivo “Datos enmascarados”. La UI no intenta desenmascararlos ni validarlos.
- Sin `console.*` en el código, sin documentos de pacientes en la URL y sin precargar datos de pacientes.
- CSP y cabeceras de seguridad en Nginx (`X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `COOP`). Ver `docker/nginx/default.conf.template`.
- Contenedor sin root (`nginx-unprivileged`, usuario 101, puerto 8080), con `cap_drop: ALL` y `no-new-privileges` en `compose.yaml`.
- Los errores muestran el código de seguimiento (`X-Correlation-Id`) para que soporte localice la petición en los logs.
- El service worker de MSW solo se publica en la imagen si se construye con `VITE_API_MOCKS=todo`.

## Calidad

```sh
pnpm test          # solo tests
pnpm run verify    # check, ESLint, tipos, tests y build
```

159 tests en Vitest (24 archivos). Cubren:

- FEFO y previsualización de la dispensación, validación por ítem y control especial.
- Idempotencia (misma clave al reintentar, clave nueva si cambia el cuerpo) y bloqueo de doble clic.
- Máquina de estados del traslado: acciones por estado, rol y autoría.
- Errores: traducción por `codigo`, 422 por campo, 409 con reintento, 429 con `Retry-After`.
- Roles: navegación y secciones visibles por habilidad, vistas de solo lectura del auditor.

El hook `pre-commit` ejecuta `vp staged`: formato y Oxlint sobre los archivos preparados y ESLint sin advertencias en los `.ts`/`.tsx`. El CI (`.github/workflows/ci.yml`) repite check, ESLint, tipos, tests y build, construye la imagen y la prueba (healthcheck, CSP, fallback de la SPA, usuario no root).

## Supuestos

- **Dispensaciones pendientes.** El backend anunció `GET /dispensaciones` (contrato v0.13.0: filas con `dispensado_por {id, nombre}`, sin paciente ni detalles), pero aún no lo ha publicado. El panel del regente lo consume si existe; si responde 404 o 405, degrada a “Abrir dispensación #” y recuerda como accesos rápidos las pendientes creadas en la sesión. La demo (`VITE_API_MOCKS=todo`) simula el listado con la forma del contrato v0.13.0.
- **Alertas.** Se construyeron cuando el contrato las marcaba “en revisión”; se ajustan a §4.8 del contrato (v0.12.0), que ya las cierra. Con un backend anterior (404 o 405), el panel muestra un aviso discreto en vez de un error.
- **Autorización de control especial.** El segundo regente autoriza desde su propia sesión. La UI no pide credenciales de otro usuario en el momento.
- **Nombres de usuario.** En traslados la API solo entrega ids, así que se muestran como “Usuario #id” (o “Tú” si es el usuario actual). El listado de pendientes usa `dispensado_por.nombre` cuando viene.
- **Bodega de trabajo.** El usuario elige su bodega en la pantalla de dispensación; la selección dura lo que la pestaña.

## Qué quedó fuera y por qué

- **Edición de ítems de un traslado en BORRADOR.** La API la admite (`PUT /traslados/{id}/items`), pero se priorizó el flujo completo de estados. Hoy se anula y se crea otro.
- **Pantallas de médico y admin.** No forman parte del módulo de farmacia del enunciado; esos roles ven un aviso.
- **Parte C del enunciado.** Vive en el backend.
- **Modo oscuro.** No aporta a los criterios de la prueba y duplica la revisión visual.
- **Pruebas E2E en navegador.** Los flujos se cubren con Testing Library sobre MSW; E2E exigiría orquestar el backend en el CI.
- **i18n.** La aplicación es solo en español; los textos están en los componentes.

## Versionado

SemVer con tags anotados: `v0.1.0` (base) … `v0.6.0` (correcciones del núcleo), `v0.7.0` (correcciones de pantallas) y `v1.0.0` para la entrega. Un commit por funcionalidad, con mensajes del tipo `feat(traslados): …`, `build: …` o `fix: …`.

- `v1.0.1`: listado de pendientes alineado con el contrato v0.13.0.

## Más documentación

- [Estrategia de despliegue](docs/despliegue.md)
- [Uso de herramientas de IA](AI_USAGE.md)
