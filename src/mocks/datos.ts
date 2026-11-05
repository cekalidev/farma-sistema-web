// Datos sintéticos coherentes con la semilla del backend (fechas relativas a hoy)
import type {
  Bodega,
  Dispensacion,
  Existencia,
  Habilidad,
  LoteResumen,
  MovimientoKardex,
  Paciente,
  Prescripcion,
  Producto,
  Rol,
  Traslado,
  Usuario,
} from '../api/tipos';
import { diasHastaVencer, fechaRelativa, marcaEnBogota } from '../lib/fechas';

export interface Lote extends LoteResumen {
  producto_id: number;
}

export const CONTRASENA_DEMO = 'Farma2026!';

const HAB_AUXILIAR: Habilidad[] = [
  'dispensacion.crear',
  'inventario.consultar',
  'traslado.operar',
  'traslado.anular',
  'traslado.consultar',
  'paciente.consultar',
  'bodega.consultar',
  'producto.consultar',
];

export const HABILIDADES_POR_ROL: Record<Rol, Habilidad[]> = {
  auxiliar_farmacia: HAB_AUXILIAR,
  regente_farmacia: [
    ...HAB_AUXILIAR,
    'dispensacion.autorizar',
    'inventario.registrar',
    'traslado.aprobar',
  ],
  medico: ['prescripcion.crear', 'paciente.consultar', 'producto.consultar'],
  auditor: [
    'inventario.consultar',
    'traslado.consultar',
    'paciente.consultar',
    'auditoria.consultar',
    'bodega.consultar',
    'producto.consultar',
  ],
  admin: ['auditoria.consultar', 'bodega.consultar', 'producto.consultar', 'catalogo.gestionar'],
};

function usuario(id: number, nombre: string, email: string, rol: Rol): Usuario {
  return { id, nombre, email, rol, habilidades: HABILIDADES_POR_ROL[rol] };
}

export const USUARIOS: Usuario[] = [
  usuario(1, 'Auxiliar Demo', 'auxiliar@farma.test', 'auxiliar_farmacia'),
  usuario(2, 'Regente Demo', 'regente@farma.test', 'regente_farmacia'),
  usuario(3, 'Regente Demo Dos', 'regente2@farma.test', 'regente_farmacia'),
  usuario(4, 'Médico Demo', 'medico@farma.test', 'medico'),
  usuario(5, 'Auditor Demo', 'auditor@farma.test', 'auditor'),
  usuario(6, 'Admin Demo', 'admin@farma.test', 'admin'),
];

export function usuarioPorRol(rol: Rol): Usuario {
  const u = USUARIOS.find((x) => x.rol === rol);
  if (!u) throw new Error(`Sin usuario demo para ${rol}`);
  return u;
}

export const BODEGAS: Bodega[] = [
  { id: 1, codigo: 'FC', nombre: 'Farmacia Central', activa: true },
  { id: 2, codigo: 'FU', nombre: 'Farmacia Urgencias', activa: true },
  { id: 3, codigo: 'BH', nombre: 'Bodega Hospitalización', activa: true },
];

export const PRODUCTOS: Producto[] = [
  {
    id: 1,
    codigo: 'ACET500',
    nombre: 'Acetaminofén 500 mg',
    presentacion: 'Tableta',
    unidad_medida: 'tableta',
    control_especial: false,
    activo: true,
  },
  {
    id: 2,
    codigo: 'AMOX500',
    nombre: 'Amoxicilina 500 mg',
    presentacion: 'Cápsula',
    unidad_medida: 'cápsula',
    control_especial: false,
    activo: true,
  },
  {
    id: 3,
    codigo: 'IBU400',
    nombre: 'Ibuprofeno 400 mg',
    presentacion: 'Tableta',
    unidad_medida: 'tableta',
    control_especial: false,
    activo: true,
  },
  {
    id: 4,
    codigo: 'LOS50',
    nombre: 'Losartán 50 mg',
    presentacion: 'Tableta',
    unidad_medida: 'tableta',
    control_especial: false,
    activo: true,
  },
  {
    id: 5,
    codigo: 'OME20',
    nombre: 'Omeprazol 20 mg',
    presentacion: 'Cápsula',
    unidad_medida: 'cápsula',
    control_especial: false,
    activo: true,
  },
  {
    id: 6,
    codigo: 'MORF10',
    nombre: 'Morfina 10 mg/mL',
    presentacion: 'Ampolla 1 mL',
    unidad_medida: 'ampolla',
    control_especial: true,
    activo: true,
  },
];

// Días hasta el vencimiento de cada lote A/B/C por producto
const DIAS_LOTE: Record<string, [number, number, number]> = {
  ACET500: [-20, 25, 300],
  AMOX500: [10, 220, 400],
  IBU400: [250, 350, 500],
  LOS50: [-3, 260, 420],
  OME20: [85, 240, 480],
  MORF10: [45, 210, 360],
};

export const LOTES: Lote[] = PRODUCTOS.flatMap((p, i) =>
  (['A', 'B', 'C'] as const).map((letra, j) => ({
    id: i * 3 + j + 1,
    producto_id: p.id,
    codigo: `${p.codigo}-${letra}`,
    fecha_vencimiento: fechaRelativa(DIAS_LOTE[p.codigo]?.[j] ?? 365),
  })),
);

// Cantidades por bodega (FC, FU, BH) y lote (A, B, C)
const CANTIDADES: Record<string, [number[], number[], number[]]> = {
  ACET500: [
    [40, 60, 80],
    [10, 50, 100],
    [0, 120, 200],
  ],
  AMOX500: [
    [30, 150, 100],
    [20, 40, 0],
    [0, 80, 60],
  ],
  IBU400: [
    [100, 200, 150],
    [50, 60, 0],
    [0, 90, 40],
  ],
  LOS50: [
    [25, 180, 120],
    [0, 30, 20],
    [5, 60, 60],
  ],
  OME20: [
    [60, 140, 100],
    [15, 25, 10],
    [0, 50, 70],
  ],
  MORF10: [
    [12, 30, 20],
    [4, 10, 0],
    [0, 6, 0],
  ],
};

export const EXISTENCIAS: Existencia[] = [];
{
  let id = 1;
  for (const bodega of BODEGAS) {
    for (const producto of PRODUCTOS) {
      const filas = CANTIDADES[producto.codigo];
      const fila = filas?.[bodega.id - 1] ?? [];
      LOTES.filter((l) => l.producto_id === producto.id).forEach((lote, j) => {
        const cantidad = fila[j] ?? 0;
        if (cantidad === 0) return;
        EXISTENCIAS.push({
          id: id++,
          bodega_id: bodega.id,
          producto_id: producto.id,
          lote_id: lote.id,
          bodega: { id: bodega.id, codigo: bodega.codigo, nombre: bodega.nombre },
          producto: { id: producto.id, codigo: producto.codigo, nombre: producto.nombre },
          lote: { id: lote.id, codigo: lote.codigo, fecha_vencimiento: lote.fecha_vencimiento },
          fecha_vencimiento: lote.fecha_vencimiento,
          cantidad,
          vencido: diasHastaVencer(lote.fecha_vencimiento) <= 0,
        });
      });
    }
  }
}

/** Stock mínimo por bodega y producto (FC/ACET500 = 200 queda por debajo). */
export const MINIMOS: { bodega_id: number; producto_id: number; minimo: number }[] = [
  { bodega_id: 1, producto_id: 1, minimo: 200 },
  { bodega_id: 1, producto_id: 2, minimo: 100 },
  { bodega_id: 1, producto_id: 6, minimo: 40 },
  { bodega_id: 2, producto_id: 1, minimo: 100 },
  { bodega_id: 2, producto_id: 6, minimo: 20 },
  { bodega_id: 3, producto_id: 4, minimo: 50 },
];

export const PACIENTES: Paciente[] = [
  {
    id: 1,
    tipo_documento: 'CC',
    numero_documento: '9900000001',
    nombres: 'Ana',
    apellidos: 'Sintética',
    fecha_nacimiento: '1985-04-12',
    telefono: '3000000001',
    correo: 'ana.sintetica@ejemplo.test',
    direccion: 'Calle Falsa 123',
    enmascarado: false,
  },
  {
    id: 2,
    tipo_documento: 'CC',
    numero_documento: '9900000002',
    nombres: 'Bruno',
    apellidos: 'Ficticio',
    fecha_nacimiento: '1960-09-30',
    telefono: '3000000002',
    correo: 'bruno.ficticio@ejemplo.test',
    direccion: 'Carrera Imaginaria 45',
    enmascarado: false,
  },
  {
    id: 3,
    tipo_documento: 'CC',
    numero_documento: '9900000003',
    nombres: 'Carla',
    apellidos: 'Demo',
    fecha_nacimiento: '1972-01-20',
    telefono: '3000000003',
    correo: 'carla.demo@ejemplo.test',
    direccion: 'Avenida Prueba 7',
    enmascarado: false,
  },
];

function producto(id: number) {
  const p = PRODUCTOS.find((x) => x.id === id);
  if (!p) throw new Error(`Producto ${id} inexistente`);
  return { id: p.id, codigo: p.codigo, nombre: p.nombre, control_especial: p.control_especial };
}

function prescripcion(id: number, pacienteId: number, items: [number, number][]): Prescripcion {
  return {
    id,
    paciente_id: pacienteId,
    medico_id: 4,
    estado: 'ACTIVA',
    fecha_emision: fechaRelativa(-2),
    fecha_vencimiento: fechaRelativa(28),
    observaciones: null,
    items: items.map(([productoId, cantidad], i) => ({
      id: id * 10 + i + 1,
      producto_id: productoId,
      producto: producto(productoId),
      cantidad_prescrita: cantidad,
      cantidad_pendiente: cantidad,
      indicaciones: null,
    })),
  };
}

export const PRESCRIPCIONES: Prescripcion[] = [
  prescripcion(1, 1, [
    [1, 30],
    [2, 21],
  ]),
  prescripcion(2, 2, [
    [4, 60],
    [5, 30],
  ]),
  prescripcion(3, 3, [
    [6, 6],
    [3, 20],
  ]),
];

const hace = (min: number) => marcaEnBogota(new Date(Date.now() - min * 60_000));

export const DISPENSACIONES: Dispensacion[] = [
  {
    id: 1,
    estado: 'PENDIENTE_AUTORIZACION',
    paciente_id: 3,
    prescripcion_id: 3,
    bodega_id: 1,
    dispensado_por_id: 1,
    autorizado_por_id: null,
    autorizado_en: null,
    rechazado_por_id: null,
    rechazado_en: null,
    motivo_rechazo: null,
    items: [
      { id: 1, prescripcion_item_id: 31, producto_id: 6, producto: producto(6), cantidad: 2 },
    ],
    detalles: [],
    created_at: hace(30),
  },
];

function bodegaResumen(id: number) {
  const b = BODEGAS.find((x) => x.id === id);
  if (!b) throw new Error(`Bodega ${id} inexistente`);
  return { id: b.id, codigo: b.codigo, nombre: b.nombre };
}

function itemTraslado(id: number, loteId: number, cantidad: number) {
  const lote = LOTES.find((l) => l.id === loteId);
  if (!lote) throw new Error(`Lote ${loteId} inexistente`);
  const p = producto(lote.producto_id);
  return {
    id,
    producto_id: p.id,
    producto: { id: p.id, codigo: p.codigo, nombre: p.nombre },
    lote_id: lote.id,
    lote: { id: lote.id, codigo: lote.codigo, fecha_vencimiento: lote.fecha_vencimiento },
    cantidad,
    cantidad_recibida: null,
    discrepancia: null,
  };
}

export const TRASLADOS: Traslado[] = [
  {
    id: 2,
    estado: 'SOLICITADO',
    bodega_origen_id: 1,
    bodega_destino_id: 2,
    bodega_origen: bodegaResumen(1),
    bodega_destino: bodegaResumen(2),
    observaciones: 'Reposición semanal',
    creado_por_id: 1,
    solicitado_por_id: 1,
    solicitado_en: hace(90),
    aprobado_por_id: null,
    aprobado_en: null,
    despachado_por_id: null,
    despachado_en: null,
    recibido_por_id: null,
    recibido_en: null,
    anulado_por_id: null,
    anulado_en: null,
    motivo_anulacion: null,
    items: [itemTraslado(3, 3, 20), itemTraslado(4, 8, 10)],
    discrepancias: [],
    created_at: hace(120),
    updated_at: hace(90),
  },
  {
    id: 1,
    estado: 'BORRADOR',
    bodega_origen_id: 1,
    bodega_destino_id: 3,
    bodega_origen: bodegaResumen(1),
    bodega_destino: bodegaResumen(3),
    observaciones: null,
    creado_por_id: 1,
    solicitado_por_id: null,
    solicitado_en: null,
    aprobado_por_id: null,
    aprobado_en: null,
    despachado_por_id: null,
    despachado_en: null,
    recibido_por_id: null,
    recibido_en: null,
    anulado_por_id: null,
    anulado_en: null,
    motivo_anulacion: null,
    items: [itemTraslado(1, 11, 15)],
    discrepancias: [],
    created_at: hace(240),
    updated_at: hace(240),
  },
];

// ---------- Kardex compartido ----------

/**
 * Movimientos del kardex simulado, compartidos por los handlers que mueven stock
 * (dispensaciones, traslados, inventario). Añadir con `registrarMovimiento` (utilidades.ts).
 */
export const MOVIMIENTOS: MovimientoKardex[] = [];

/** Semilla: una ENTRADA por existencia, coherente con su saldo actual. */
function sembrarMovimientos(): MovimientoKardex[] {
  const regente = USUARIOS.find((u) => u.id === 2);
  return EXISTENCIAS.map((e, i) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - (3 + (e.id % 10)));
    fecha.setHours(8, e.id % 60, 0, 0);
    return {
      id: i + 1,
      tipo: 'ENTRADA',
      existencia_id: e.id,
      bodega_id: e.bodega_id,
      producto_id: e.producto_id,
      lote_id: e.lote_id,
      bodega: e.bodega,
      producto: e.producto,
      lote: e.lote,
      cantidad: e.cantidad,
      saldo_anterior: 0,
      saldo_posterior: e.cantidad,
      motivo: null,
      usuario_id: 2,
      usuario: { id: 2, nombre: regente?.nombre ?? 'Usuario 2' },
      documento: null,
      created_at: marcaEnBogota(fecha),
    };
  });
}
MOVIMIENTOS.push(...sembrarMovimientos());

// ---------- Reinicio (tests) ----------

// Semilla inmutable tomada al cargar el módulo, antes de cualquier mutación
const SEMILLA = Object.freeze({
  lotes: structuredClone(LOTES),
  existencias: structuredClone(EXISTENCIAS),
  prescripciones: structuredClone(PRESCRIPCIONES),
  dispensaciones: structuredClone(DISPENSACIONES),
  traslados: structuredClone(TRASLADOS),
  movimientos: structuredClone(MOVIMIENTOS),
});

function restaurar<T>(destino: T[], semilla: readonly T[]): void {
  destino.splice(0, destino.length, ...structuredClone(semilla));
}

/**
 * Reconstruye IN-PLACE todos los arrays mutables (lotes, existencias, prescripciones,
 * dispensaciones, traslados y movimientos) desde la semilla. Las referencias exportadas
 * siguen siendo las mismas, así que los handlers no tienen que reimportar nada.
 */
export function reiniciarDatos(): void {
  restaurar(LOTES, SEMILLA.lotes);
  restaurar(EXISTENCIAS, SEMILLA.existencias);
  restaurar(PRESCRIPCIONES, SEMILLA.prescripciones);
  restaurar(DISPENSACIONES, SEMILLA.dispensaciones);
  restaurar(TRASLADOS, SEMILLA.traslados);
  restaurar(MOVIMIENTOS, SEMILLA.movimientos);
}
