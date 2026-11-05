# Uso de herramientas de IA

Este documento describe cómo se usó IA para construir el frontend, qué se aceptó, qué se rechazó o corrigió y qué controles aplicó el autor.

## Herramienta

**Claude Code** (modelo Claude Opus), asistente de programación en la terminal.

Una sesión principal coordinó el trabajo y repartió tareas a agentes auxiliares:

- uno para la base del proyecto;
- uno por pantalla, en paralelo (dispensación, traslados, inventario y kardex);
- uno para Docker y CI;
- uno para la documentación;
- revisiones independientes: dos revisores de código y una auditoría visual con capturas a 1440 y 390 px de ancho.

El autor revisó cada entrega con evidencia (lint, typecheck, tests y build) e hizo todos los commits.

## Tareas en las que se usó

- Lectura del enunciado y del contrato de la API del backend, para extraer reglas, códigos de error y permisos.
- Scaffolding del proyecto con Vite+.
- Capa de API tipada y mapa de errores por `codigo`.
- Pantallas y sus tests.
- Mocks con MSW y datos sintéticos.
- Dockerfile, configuración de Nginx y pipeline de CI.
- Revisión de código y auditoría de la interfaz.

## Ejemplos aceptados

- **Gestor de Idempotency-Key ligado a la firma del cuerpo.** Una clave por intento, reutilizada al reintentar y nueva si cambia el cuerpo. Se aceptó porque cumple el contrato (misma clave con otro cuerpo → `422 IDEMPOTENCY_KEY_REUTILIZADA`) y evita duplicar una dispensación tras un corte de red. Tiene tests propios.
- **Acciones del traslado en una función pura.** `src/features/traslados/acciones.ts` decide qué botones ve cada usuario según estado, rol y autoría. Se aceptó porque se prueba sin renderizar y deja la pantalla sin lógica de negocio.

## Ejemplos rechazados o corregidos

1. **Modo de mocks “parcial”.** El primer diseño simulaba pacientes y prescripciones mientras escribía en el backend real. Una revisión encontró que enviaba ids de ítems de prescripción simulados que el backend rechazaba, y que se podía autorizar una dispensación real distinta de la mostrada. Se eliminó el modo; quedaron dos: `todo` y `no`.
2. **Errores de validación invisibles.** `aplicarErroresAlFormulario` marcaba como mostrados errores de campos que no existían en el formulario (por ejemplo `bodega_id`). El usuario pulsaba Confirmar y no veía nada. Se corrigió para devolver los errores no aplicados y mostrarlos en un aviso.
3. **Fechas con la zona del navegador.** Los vencimientos se calculaban con la zona horaria local. Se cambiaron a America/Bogota, como el backend, con tests que fijan el navegador en UTC.
4. **Desbordes en móvil.** La auditoría visual a 390 px encontró scroll horizontal de página, causado por elementos `sr-only` con posición absoluta fuera de un contenedor sin posicionar, y una cabecera de 165 px de alto. Se corrigieron ambos. Tras las correcciones se repitió la auditoría con el flujo completo (login, dispensación con panel de pendientes, inventario con alertas y diálogo de ajuste, kardex, traslado creado por el auxiliar y llevado hasta la recepción por el regente, y auditor en inventario). A 390 px, el ancho de la página (`scrollWidth`) quedó en 390 en todas las pantallas y la cabecera en 91 px. Solo apareció un defecto nuevo: el contorno de foco de los enlaces del menú se recortaba arriba y abajo por el scroll del menú. Se corrigió y se confirmó con una segunda pasada.
5. **`.dockerignore` generado.** Incluía entradas que revelaban configuración local de herramientas. Se rechazó y se reescribió solo con lo que pertenece al proyecto.
6. **Commits por funcionalidad.** Al dividir el trabajo en commits mientras los agentes seguían editando, hubo que preparar el índice a mano con placeholders verificados para que cada commit compilara por sí solo.

## Controles humanos

- Plan aprobado por el autor antes de escribir código.
- Verificación con comandos en cada fase: `pnpm run check`, `pnpm run lint:eslint`, `pnpm run typecheck`, `pnpm test` y `pnpm build`.
- Como máximo dos revisores por paso.
- Commits hechos por el autor, sin firmas automáticas.
- Solo datos sintéticos: usuarios `@farma.test`, pacientes y documentos inventados.

## Límites

El autor puede explicar y modificar todo el código en la sustentación. No se usaron datos reales de pacientes, usuarios ni sistemas en ningún momento.
