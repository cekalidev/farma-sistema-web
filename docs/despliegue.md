# Estrategia de despliegue del frontend

El frontend se entrega como una imagen de contenedor: Nginx sin root sirve la SPA compilada y hace de proxy de `/api` hacia el backend. El pipeline está en `.github/workflows/ci.yml`; los pasos de despliegue están simulados porque no hay registro ni servidores reales.

## Imagen inmutable

- Se construye una sola vez por commit y se etiqueta con el tag SemVer (`v1.0.0`) o con `sha-<12 caracteres>` en `main`.
- La misma imagen pasa por staging y producción; nunca se reconstruye para un entorno.
- Antes de publicarla, el CI la arranca y comprueba el healthcheck, la CSP, el fallback de la SPA, que `mockServiceWorker.js` no se publica y que el proceso no corre como root.

## Entornos y aprobación

| Disparador    | Staging    | Producción             |
| ------------- | ---------- | ---------------------- |
| Push a `main` | Automático | —                      |
| Tag `v*`      | Automático | Tras aprobación manual |
| Pull request  | —          | —                      |

Producción usa un environment de GitHub (`produccion`) con _required reviewers_: el job espera hasta que una persona lo aprueba. Conviene limitar ese environment a tags `v*`.

## Configuración

- En tiempo de ejecución, solo `API_UPSTREAM` (URL de la API, sin barra final). El entrypoint de Nginx la sustituye en la plantilla al arrancar el contenedor.
- `VITE_API_URL` y `VITE_API_MOCKS` se fijan al construir la imagen (`/api/v1` y `no` en producción). Son públicas: nunca llevan secretos.
- El frontend no guarda secretos. El token del usuario vive en `sessionStorage` del navegador.

## Salud

- `GET /healthz` responde `200 ok` sin pasar por la API. Lo usan el `HEALTHCHECK` de la imagen, el compose y el balanceador.
- Tras desplegar, se verifica `/healthz` y que `/` sirve `index.html` con la cabecera CSP.

## Rollback

- Volver a desplegar la imagen del tag anterior (`v0.7.0`, por ejemplo). No hay migraciones ni datos en el frontend: la SPA no guarda estado en el servidor.
- `index.html` se sirve con `Cache-Control: no-cache`, así que los navegadores piden la versión vigente en la siguiente carga.
- Los assets de `/assets/` llevan hash en el nombre y se cachean un año como inmutables. Las versiones no se pisan entre sí; un usuario con la pestaña abierta sigue con su versión hasta recargar.

## Base de datos: respaldo y restauración

Corresponde al backend (repositorio `farma-sistema`), que es dueño de PostgreSQL. Este repositorio no define ni ejecuta respaldos. Un rollback del frontend nunca requiere restaurar la base de datos.

## Compatibilidad entre API y frontend

- El frontend consume `/api/v1` según `docs/contrato-api.md` del backend: hasta `v0.13.0`, que publica el listado `GET /dispensaciones`. Con un backend anterior a `v0.13.0` el frontend degrada ante 404 o 405 y ofrece abrir la dispensación por número.
- Cambios aditivos en la API (campos o endpoints nuevos) no rompen el frontend: los tipos ignoran campos desconocidos y un `codigo` de error nuevo muestra un mensaje genérico.
- Un cambio incompatible exige `/api/v2` o un orden de despliegue: primero el backend compatible con ambas versiones, después el frontend.
- Para depurar, cada error muestra el código de seguimiento (`X-Correlation-Id` o `X-Request-Id`) que el backend registra en sus logs.
