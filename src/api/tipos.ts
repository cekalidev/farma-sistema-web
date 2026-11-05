// Tipos de los recursos de la API v1 (contrato del backend)

export type Rol = 'auxiliar_farmacia' | 'regente_farmacia' | 'medico' | 'auditor' | 'admin';

export type Habilidad =
  | 'dispensacion.crear'
  | 'dispensacion.autorizar'
  | 'inventario.consultar'
  | 'inventario.registrar'
  | 'traslado.operar'
  | 'traslado.aprobar'
  | 'traslado.anular'
  | 'traslado.consultar'
  | 'prescripcion.crear'
  | 'paciente.consultar'
  | 'auditoria.consultar'
  | 'bodega.consultar'
  | 'producto.consultar'
  | 'catalogo.gestionar';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  habilidades: Habilidad[];
}

/** Respuesta de POST /auth/login (sin envoltorio `data`). */
export interface RespuestaLogin {
  token: string;
  token_type: 'Bearer';
  expira_en_minutos: number | null;
  rol: Rol;
  usuario: Usuario;
}

export interface Envoltorio<T> {
  data: T;
}

export interface MetaPaginacion {
  current_page: number;
  from: number | null;
  last_page: number;
  links: { url: string | null; label: string; active: boolean }[];
  path: string;
  per_page: number;
  to: number | null;
  total: number;
}

export interface Paginado<T> {
  data: T[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: MetaPaginacion;
}

export interface ParamsPaginacion {
  por_pagina?: number;
  page?: number;
}

/** Fecha `Y-m-d`. */
export type FechaISO = string;
/** Timestamp ISO 8601. */
export type MarcaTiempo = string;

// ---------- Catálogos ----------

export interface BodegaResumen {
  id: number;
  codigo: string;
  nombre: string;
}

export interface Bodega extends BodegaResumen {
  activa: boolean;
}

export interface ProductoResumen {
  id: number;
  codigo: string;
  nombre: string;
}

export interface ProductoConControl extends ProductoResumen {
  control_especial: boolean;
}

export interface Producto extends ProductoConControl {
  presentacion: string | null;
  unidad_medida: string;
  activo: boolean;
}

export interface LoteResumen {
  id: number;
  codigo: string;
  fecha_vencimiento: FechaISO;
}

// ---------- Inventario ----------

export interface Existencia {
  id: number;
  bodega_id: number;
  producto_id: number;
  lote_id: number;
  bodega: BodegaResumen;
  producto: ProductoResumen;
  lote: LoteResumen;
  fecha_vencimiento: FechaISO;
  cantidad: number;
  vencido: boolean;
}

export interface FiltrosInventario extends ParamsPaginacion {
  bodega_id?: number;
  producto_id?: number;
  lote_id?: number;
}

export type EntradaInventario = {
  bodega_id: number;
  producto_id: number;
  cantidad: number;
} & (
  | { lote_id: number; lote?: never }
  | { lote: { codigo: string; fecha_vencimiento: FechaISO }; lote_id?: never }
);

export interface ResultadoEntrada extends Existencia {
  entrada: {
    cantidad: number;
    saldo_anterior: number;
    saldo_posterior: number;
    lote_creado: boolean;
    movimiento_id: number;
  };
}

export interface AjusteInventario {
  existencia_id: number;
  /** Distinto de 0, con signo. */
  cantidad: number;
  motivo: string;
}

// ---------- Kardex ----------

export type TipoMovimiento =
  | 'ENTRADA'
  | 'SALIDA_DISPENSACION'
  | 'SALIDA_TRASLADO'
  | 'ENTRADA_TRASLADO'
  | 'AJUSTE';

export interface MovimientoKardex {
  id: number;
  tipo: TipoMovimiento;
  existencia_id: number;
  bodega_id: number;
  producto_id: number;
  lote_id: number;
  bodega: BodegaResumen;
  producto: ProductoResumen;
  lote: LoteResumen;
  /** Con signo. */
  cantidad: number;
  saldo_anterior: number;
  saldo_posterior: number;
  motivo: string | null;
  usuario_id: number;
  usuario: { id: number; nombre: string };
  documento: { tipo: 'dispensacion' | 'traslado'; id: number } | null;
  created_at: MarcaTiempo;
}

export interface FiltrosKardex extends ParamsPaginacion {
  producto_id?: number;
  lote_id?: number;
  bodega_id?: number;
  existencia_id?: number;
  desde?: FechaISO;
  hasta?: FechaISO;
}

// ---------- Pacientes y prescripciones ----------

export type TipoDocumento = 'CC' | 'TI' | 'CE' | 'PA' | 'RC';

export interface Paciente {
  id: number;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  /** `Y-m-d`, o solo el año (`YYYY`) si viene enmascarado. */
  fecha_nacimiento: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  /** true para el auditor: datos enmascarados. */
  enmascarado: boolean;
}

export interface BusquedaPaciente {
  tipo_documento?: TipoDocumento;
  numero_documento: string;
}

export interface PrescripcionItem {
  id: number;
  producto_id: number;
  producto: ProductoConControl;
  cantidad_prescrita: number;
  /** Lo que falta por dispensar (null si el backend no lo calculó). */
  cantidad_pendiente: number | null;
  indicaciones: string | null;
}

export interface Prescripcion {
  id: number;
  paciente_id: number;
  medico_id: number;
  estado: 'ACTIVA' | 'ANULADA';
  fecha_emision: FechaISO;
  fecha_vencimiento: FechaISO;
  /** null para el auditor. */
  observaciones: string | null;
  paciente?: Paciente;
  items: PrescripcionItem[];
}

// ---------- Dispensaciones ----------

export type EstadoDispensacion = 'CONFIRMADA' | 'PENDIENTE_AUTORIZACION' | 'RECHAZADA';

export interface SolicitudDispensacion {
  paciente_id: number;
  prescripcion_id: number;
  bodega_id: number;
  items: { prescripcion_item_id: number; cantidad: number }[];
}

export interface Previsualizacion {
  bodega_id: number;
  orientativa: true;
  items: {
    prescripcion_item_id: number;
    producto_id: number;
    producto: ProductoConControl;
    cantidad: number;
  }[];
  detalles: {
    prescripcion_item_id: number;
    existencia_id: number;
    producto_id: number;
    lote_id: number;
    lote: LoteResumen;
    cantidad: number;
  }[];
}

export interface DispensacionItem {
  id: number;
  prescripcion_item_id: number;
  producto_id: number;
  producto: ProductoConControl;
  cantidad: number;
}

export interface DispensacionDetalle {
  id: number;
  dispensacion_item_id: number;
  prescripcion_item_id: number;
  existencia_id: number;
  producto_id: number;
  lote_id: number;
  lote: LoteResumen;
  cantidad: number;
  movimiento: MovimientoKardex;
}

export interface Dispensacion {
  id: number;
  estado: EstadoDispensacion;
  paciente_id: number;
  /** Solo en el detalle (GET /dispensaciones/{id}). */
  paciente?: Paciente;
  prescripcion_id: number;
  bodega_id: number;
  dispensado_por_id: number;
  autorizado_por_id: number | null;
  autorizado_en: MarcaTiempo | null;
  rechazado_por_id: number | null;
  rechazado_en: MarcaTiempo | null;
  motivo_rechazo: string | null;
  items: DispensacionItem[];
  /** Vacío mientras está PENDIENTE_AUTORIZACION. */
  detalles: DispensacionDetalle[];
  created_at: MarcaTiempo;
}

export interface FiltrosDispensaciones extends ParamsPaginacion {
  estado?: EstadoDispensacion;
  bodega_id?: number;
}

// ---------- Traslados ----------

export type EstadoTraslado =
  | 'BORRADOR'
  | 'SOLICITADO'
  | 'APROBADO'
  | 'EN_TRANSITO'
  | 'RECIBIDO'
  | 'RECIBIDO_PARCIAL'
  | 'ANULADO';

export type TipoResolucion = 'PERDIDA' | 'REINTEGRO_ORIGEN' | 'ENTREGA_DESTINO';

export interface Discrepancia {
  id: number;
  traslado_item_id: number;
  traslado_id: number;
  producto_id: number;
  lote_id: number;
  cantidad: number;
  estado: 'PENDIENTE' | 'RESUELTA';
  tipo_resolucion: TipoResolucion | null;
  motivo: string | null;
  resuelto_por_id: number | null;
  resuelto_en: MarcaTiempo | null;
  movimiento_kardex_id: number | null;
  created_at: MarcaTiempo;
}

export interface TrasladoItem {
  id: number;
  producto_id: number;
  producto: ProductoResumen;
  lote_id: number;
  lote: LoteResumen;
  cantidad: number;
  cantidad_recibida: number | null;
  discrepancia: Discrepancia | null;
}

export interface Traslado {
  id: number;
  estado: EstadoTraslado;
  bodega_origen_id: number;
  bodega_destino_id: number;
  bodega_origen: BodegaResumen;
  bodega_destino: BodegaResumen;
  observaciones: string | null;
  creado_por_id: number;
  solicitado_por_id: number | null;
  solicitado_en: MarcaTiempo | null;
  aprobado_por_id: number | null;
  aprobado_en: MarcaTiempo | null;
  despachado_por_id: number | null;
  despachado_en: MarcaTiempo | null;
  recibido_por_id: number | null;
  recibido_en: MarcaTiempo | null;
  anulado_por_id: number | null;
  anulado_en: MarcaTiempo | null;
  motivo_anulacion: string | null;
  items: TrasladoItem[];
  discrepancias: Discrepancia[];
  created_at: MarcaTiempo;
  updated_at: MarcaTiempo;
}

export interface ItemTrasladoNuevo {
  producto_id: number;
  lote_id: number;
  cantidad: number;
}

export interface NuevoTraslado {
  bodega_origen_id: number;
  bodega_destino_id: number;
  observaciones?: string;
  /** 1..50 ítems. */
  items: ItemTrasladoNuevo[];
}

export interface RecepcionTraslado {
  /** Todos los ítems del traslado, 0..despachada. */
  items: { traslado_item_id: number; cantidad_recibida: number }[];
}

export interface FiltrosTraslados extends ParamsPaginacion {
  estado?: EstadoTraslado;
  bodega_origen_id?: number;
  bodega_destino_id?: number;
  bodega_id?: number;
}

export interface ResolucionDiscrepancia {
  tipo: TipoResolucion;
  motivo: string;
}

// ---------- Alertas ----------

export interface AlertaVencimiento {
  existencia_id: number;
  bodega: BodegaResumen;
  producto: ProductoResumen;
  lote: LoteResumen;
  fecha_vencimiento: string;
  cantidad: number;
  /** VENCIDO: vence hoy o antes (dias_restantes ≤ 0). */
  tipo: 'POR_VENCER' | 'VENCIDO';
  /** fecha_vencimiento − meta.hoy, en días (negativo = días que lleva vencido). */
  dias_restantes: number;
}

export interface AlertaStockMinimo {
  stock_minimo_id: number;
  bodega: BodegaResumen;
  producto: ProductoResumen;
  minimo: number;
  /** Stock vigente (lotes que vencen después de meta.hoy). */
  actual: number;
  /** minimo − actual (> 0). */
  faltante: number;
}

/** Meta de las alertas: paginación más la fecha de negocio usada (Bogotá). */
export interface MetaAlertas extends MetaPaginacion {
  hoy: string;
  /** Solo en vencimientos: umbral efectivo de días. */
  dias_alerta_vencimiento?: number;
}

export interface AlertasPaginadas<T> {
  data: T[];
  links: Paginado<T>['links'];
  meta: MetaAlertas;
}

export interface FiltrosAlertas extends ParamsPaginacion {
  bodega_id?: number | undefined;
  producto_id?: number | undefined;
}
