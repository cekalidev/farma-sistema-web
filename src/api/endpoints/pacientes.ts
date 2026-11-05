// Pacientes y prescripciones (el backend los está incorporando; el mock replica su forma)
import { peticion } from '../client';
import { hoyISO } from '../../lib/fechas';
import type { BusquedaPaciente, Envoltorio, Paciente, Prescripcion } from '../tipos';

export const pacientesKeys = {
  todo: ['pacientes'] as const,
  busqueda: (b: BusquedaPaciente) => ['pacientes', 'busqueda', b] as const,
  detalle: (id: number) => ['pacientes', id] as const,
  prescripciones: (pacienteId: number) => ['pacientes', pacienteId, 'prescripciones'] as const,
};

/** POST para no dejar el documento en la URL ni en logs. */
export async function buscarPacientes(busqueda: BusquedaPaciente): Promise<Paciente[]> {
  const r = await peticion<Envoltorio<Paciente[]>>('/pacientes/buscar', {
    method: 'POST',
    body: busqueda,
  });
  return r.data;
}

export async function obtenerPaciente(id: number, signal?: AbortSignal): Promise<Paciente> {
  const r = await peticion<Envoltorio<Paciente>>(`/pacientes/${id}`, signal ? { signal } : {});
  return r.data;
}

/** Todas las prescripciones del paciente (más reciente primero). Filtra con `esPrescripcionVigente`. */
export async function listarPrescripciones(
  pacienteId: number,
  signal?: AbortSignal,
): Promise<Prescripcion[]> {
  const r = await peticion<Envoltorio<Prescripcion[]>>(
    `/pacientes/${pacienteId}/prescripciones`,
    signal ? { signal } : {},
  );
  return r.data;
}

/** ACTIVA y sin vencer (vence hoy o después). */
export function esPrescripcionVigente(p: Prescripcion, hoy: string = hoyISO()): boolean {
  return p.estado === 'ACTIVA' && p.fecha_vencimiento >= hoy;
}
