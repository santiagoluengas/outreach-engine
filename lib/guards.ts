/** Reglas que impiden que la automatización haga algo vergonzoso: horario,
 *  variables sin resolver, topes diarios y duplicados. */
import { EXIGIR_OPT_IN_WA, LIMITES, TZ, VENTANA } from "./config";
import type { Canal, ItemCola, Lead } from "./types";

const partes = (d: Date) => {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    fecha: `${g("year")}-${g("month")}-${g("day")}`,
    hora: Number(g("hour")),
    minuto: Number(g("minute")),
    diaSemana: dias[g("weekday")] ?? 0,
  };
};

/** Fecha local (YYYY-MM-DD) en la zona de trabajo. */
export const fechaLocal = (d: Date = new Date()) => partes(d).fecha;

/** ¿Se puede enviar en este instante? */
export function enVentana(d: Date = new Date()): boolean {
  const p = partes(d);
  return (
    VENTANA.diasHabiles.includes(p.diaSemana) &&
    p.hora >= VENTANA.horaInicio &&
    p.hora < VENTANA.horaFin
  );
}

/** Suma días hábiles y aterriza el resultado dentro de la ventana de envío. */
export function programarEn(desde: Date, dias: number): Date {
  const d = new Date(desde.getTime() + dias * 86400000);
  // Avanza en saltos de 1h hasta caer en ventana válida (máx 14 días de búsqueda).
  for (let i = 0; i < 24 * 14 && !enVentana(d); i++) {
    d.setTime(d.getTime() + 3600000);
  }
  return d;
}

/** Variables sin reemplazar => el mensaje no sale. Es la falla más cara de outreach. */
export function tieneVariablesSinResolver(texto: string): boolean {
  return /\{\{\s*[\w.]+\s*\}\}/.test(texto);
}

export function enviadosHoy(cola: ItemCola[], canal: Canal): number {
  const hoy = fechaLocal();
  return cola.filter(
    (i) => i.canal === canal && i.estado === "enviado" && i.enviadoAt && fechaLocal(new Date(i.enviadoAt)) === hoy
  ).length;
}

export function cupoDisponible(cola: ItemCola[], canal: Canal): number {
  const tope = canal === "email" ? LIMITES.emailPorDia : LIMITES.whatsappPorDia;
  return Math.max(0, tope - enviadosHoy(cola, canal));
}

/** Un lead solo avanza si está vivo, sin opt-out y sin respuesta previa. */
export function leadElegible(lead: Lead): boolean {
  return lead.estado === "nuevo" || lead.estado === "en_secuencia";
}

/** WhatsApp en frío sin consentimiento sube el riesgo de que te bloqueen y te bajen el
 *  quality rating. Con EXIGIR_OPT_IN_WA=si solo salen los leads con opt-in explícito. */
export function puedeWhatsapp(lead: Lead): boolean {
  if (lead.telefono.length < 10) return false;
  if (EXIGIR_OPT_IN_WA) return lead.optInWhatsapp === "si";
  return lead.optInWhatsapp !== "no";
}

export function puedeEmail(lead: Lead): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email);
}

export const maxPorTick = LIMITES.porTick;
