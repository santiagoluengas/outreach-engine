/** Acceso tipado al Sheet. El orden de las columnas es contrato: si cambia acá,
 *  hay que cambiarlo en scripts/bootstrap-sheet.mjs y en el Sheet. */
import { PESTANAS } from "./config";
import { agregarFilas, escribirCeldas, leerFilas } from "./sheets";
import type { Canal, Evento, ItemCola, Lead, Plantilla } from "./types";

export const COLS_LEADS = [
  "id", "nombre", "empresa", "cargo", "email", "telefono", "industria",
  "contexto", "fuente", "estado", "paso_actual", "opt_in_whatsapp",
  "ultimo_envio_at", "creado_at", "notas",
] as const;

export const COLS_COLA = [
  "id", "lead_id", "canal", "paso", "estado", "asunto", "cuerpo",
  "programado_at", "enviado_at", "mensaje_id", "hilo_id", "error",
] as const;

export const COLS_EVENTOS = ["ts", "lead_id", "tipo", "canal", "detalle"] as const;

export const COLS_PLANTILLAS = [
  "paso", "canal", "delay_dias", "asunto", "cuerpo",
  "wa_template", "wa_idioma", "activa",
] as const;

const at = (v: string[], i: number) => (v[i] ?? "").trim();

export async function leerLeads(): Promise<Lead[]> {
  const filas = await leerFilas(PESTANAS.leads);
  return filas
    .filter((f) => at(f.valores, 0) !== "")
    .map(({ valores: v, fila }) => ({
      id: at(v, 0),
      nombre: at(v, 1),
      empresa: at(v, 2),
      cargo: at(v, 3),
      email: at(v, 4).toLowerCase(),
      telefono: at(v, 5).replace(/[^0-9]/g, ""),
      industria: at(v, 6),
      contexto: at(v, 7),
      fuente: at(v, 8),
      estado: (at(v, 9) || "nuevo") as Lead["estado"],
      pasoActual: Number(at(v, 10) || 0),
      optInWhatsapp: at(v, 11).toLowerCase(),
      ultimoEnvioAt: at(v, 12),
      creadoAt: at(v, 13),
      notas: at(v, 14),
      _fila: fila,
    }));
}

export async function actualizarLead(
  lead: Lead,
  cambios: Partial<Pick<Lead, "estado" | "pasoActual" | "ultimoEnvioAt" | "notas">>
): Promise<void> {
  const mapa: Record<string, number> = {
    estado: 9, pasoActual: 10, ultimoEnvioAt: 12, notas: 14,
  };
  await escribirCeldas(
    Object.entries(cambios).map(([k, valor]) => ({
      pestana: PESTANAS.leads,
      fila: lead._fila,
      columna: mapa[k],
      valor: String(valor),
    }))
  );
}

export async function leerCola(): Promise<ItemCola[]> {
  const filas = await leerFilas(PESTANAS.cola);
  return filas
    .filter((f) => at(f.valores, 0) !== "")
    .map(({ valores: v, fila }) => ({
      id: at(v, 0),
      leadId: at(v, 1),
      canal: at(v, 2) as Canal,
      paso: Number(at(v, 3) || 0),
      estado: (at(v, 4) || "borrador") as ItemCola["estado"],
      asunto: v[5] ?? "",
      cuerpo: v[6] ?? "",
      programadoAt: at(v, 7),
      enviadoAt: at(v, 8),
      mensajeId: at(v, 9),
      hiloId: at(v, 10),
      error: at(v, 11),
      _fila: fila,
    }));
}

export async function encolar(items: Omit<ItemCola, "_fila">[]): Promise<void> {
  await agregarFilas(
    PESTANAS.cola,
    items.map((i) => [
      i.id, i.leadId, i.canal, String(i.paso), i.estado, i.asunto, i.cuerpo,
      i.programadoAt, i.enviadoAt, i.mensajeId, i.hiloId, i.error,
    ])
  );
}

export async function actualizarItem(
  item: ItemCola,
  cambios: Partial<Pick<ItemCola, "estado" | "asunto" | "cuerpo" | "programadoAt" | "enviadoAt" | "mensajeId" | "hiloId" | "error">>
): Promise<void> {
  const mapa: Record<string, number> = {
    estado: 4, asunto: 5, cuerpo: 6, programadoAt: 7,
    enviadoAt: 8, mensajeId: 9, hiloId: 10, error: 11,
  };
  await escribirCeldas(
    Object.entries(cambios).map(([k, valor]) => ({
      pestana: PESTANAS.cola,
      fila: item._fila,
      columna: mapa[k],
      valor: String(valor),
    }))
  );
}

export async function leerPlantillas(): Promise<Plantilla[]> {
  const filas = await leerFilas(PESTANAS.plantillas);
  return filas
    .filter((f) => at(f.valores, 0) !== "")
    .map(({ valores: v }) => ({
      paso: Number(at(v, 0)),
      canal: at(v, 1) as Canal,
      delayDias: Number(at(v, 2) || 0),
      asunto: v[3] ?? "",
      cuerpo: v[4] ?? "",
      waTemplate: at(v, 5),
      waIdioma: at(v, 6) || "es",
      activa: at(v, 7).toLowerCase() !== "no",
    }))
    .filter((p) => p.activa)
    .sort((a, b) => a.paso - b.paso);
}

export async function registrarEventos(eventos: Evento[]): Promise<void> {
  await agregarFilas(
    PESTANAS.eventos,
    eventos.map((e) => [e.ts, e.leadId, e.tipo, e.canal, e.detalle])
  );
}
