// La CSP de la imagen Docker no permite 'unsafe-eval'. Sin esto, Zod 4 prueba `new Function('')`
// al crear el primer z.object y el navegador registra una violación de CSP.
// Se importa PRIMERO en main.tsx, antes de cualquier módulo que defina esquemas.
import { z } from 'zod';

z.config({ jitless: true });
