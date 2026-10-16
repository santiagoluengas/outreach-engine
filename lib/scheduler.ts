/** El motor. Un "tick" hace tres cosas, en este orden:
 *   1. detecta respuestas y frena esas secuencias,
 *   2. planifica el siguiente mensaje de cada lead vivo,
 *   3. envía lo que ya está aprobado y le llegó la hora.
 *  Es idempotente: correrlo dos veces seguidas no duplica nada. */
import { LIMITES, PASOS_CON_APROBACION } from "./config";
import {
  cupoDisponible, enVentana, leadElegible, maxPorTick, programarEn,
  puedeEmail, puedeWhatsapp, tieneVariablesSinResolver,
} from "./guards";
import { enviarEmail, hilosConRespuesta } from "./gmail";
import {
  actualizarItem, actualizarLead, encolar, leerCola, leerLeads,
  leerPlantillas, registrarEventos,
} from "./repo";
import { paramsWhatsapp, plantillaDePaso, render } from "./templates";
import type { Evento, ItemCola, Lead, Plantilla } from "./types";
import { enviarPlantilla, enviarTexto } from "./whatsapp";

export interface Resumen {
  respuestasDetectadas: number;
  planificados: number;
  enviados: { email: number; whatsapp: number };
  omitidos: string[];
  errores: string[];
  ventanaAbierta: boolean;
}

const ahora = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tick(opts: { dryRun?: boolean } = {}): Promise<Resumen> {
  const dryRun = opts.dryRun ?? false;
  const res: Resumen = {
    respuestasDetectadas: 0, planificados: 0,
    enviados: { email: 0, whatsapp: 0 },
    omitidos: [], errores: [], ventanaAbierta: enVentana(),
  };
  const eventos: Evento[] = [];

  const [leads, cola, plantillas] = await Promise.all([
    leerLeads(), leerCola(), leerPlantillas(),
  ]);
  const porId = new Map(leads.map((l) => [l.id, l]));

  // ---- 1. Respuestas por correo -> la secuencia se detiene ---------------------
  const hilosVivos = cola
    .filter((i) => i.canal === "email" && i.estado === "enviado" && i.hiloId)
    .filter((i) => leadElegible(porId.get(i.leadId) ?? ({} as Lead)))
    .map((i) => i.hiloId);

  const conRespuesta = hilosVivos.length ? await hilosConRespuesta(hilosVivos) : new Set<string>();

  for (const item of cola) {
    if (!conRespuesta.has(item.hiloId)) continue;
    const lead = porId.get(item.leadId);
    if (!lead || !leadElegible(lead)) continue;
    res.respuestasDetectadas++;
    eventos.push({ ts: ahora(), leadId: lead.id, tipo: "respondio", canal: "email", detalle: item.hiloId });
    if (!dryRun) {
      await actualizarLead(lead, { estado: "respondio" });
      await cancelarPendientes(cola, lead.id, "lead respondió");
    }
    lead.estado = "respondio";
  }

  // ---- 2. Planificación --------------------------------------------------------
  const nuevos: Omit<ItemCola, "_fila">[] = [];

  for (const lead of leads) {
    if (!leadElegible(lead)) continue;

    // Un lead solo tiene un mensaje pendiente a la vez.
    const pendiente = cola.some(
      (i) => i.leadId === lead.id && (i.estado === "borrador" || i.estado === "aprobado")
    );
    if (pendiente) continue;

    let paso = lead.pasoActual + 1;
    let plantilla: Plantilla | undefined;
    let saltos = 0;

    // Salta pasos cuyo canal no aplica a este lead (p. ej. sin opt-in de WhatsApp).
    while (saltos < 10) {
      plantilla = plantillaDePaso(plantillas, paso);
      if (!plantilla) break;
      const aplica =
        plantilla.canal === "email" ? puedeEmail(lead) : puedeWhatsapp(lead);
      if (aplica) break;
      res.omitidos.push(`${lead.id}: paso ${paso} (${plantilla.canal}) sin datos/opt-in`);
      eventos.push({
        ts: ahora(), leadId: lead.id, tipo: "paso_omitido",
        canal: plantilla.canal, detalle: `paso ${paso}`,
      });
      if (!dryRun) await actualizarLead(lead, { pasoActual: paso });
      lead.pasoActual = paso;
      paso++;
      saltos++;
    }

    if (!plantilla) {
      // Se acabó la secuencia.
      if (lead.pasoActual > 0 && !dryRun) await actualizarLead(lead, { estado: "terminado" });
      continue;
    }

    const yaExiste = cola.some((i) => i.leadId === lead.id && i.paso === paso && i.estado !== "cancelado");
    if (yaExiste) continue;

    const base = lead.ultimoEnvioAt ? new Date(lead.ultimoEnvioAt) : new Date();
    const programadoAt = programarEn(base, plantilla.delayDias).toISOString();

    const asunto = render(plantilla.asunto, lead);
    const cuerpo =
      plantilla.canal === "email"
        ? render(plantilla.cuerpo, lead)
        : paramsWhatsapp(plantilla, lead).join("|");

    const sinResolver = tieneVariablesSinResolver(asunto) || tieneVariablesSinResolver(cuerpo);
    const estado: ItemCola["estado"] =
      sinResolver || paso <= PASOS_CON_APROBACION ? "borrador" : "aprobado";

    nuevos.push({
      id: id(), leadId: lead.id, canal: plantilla.canal, paso, estado,
      asunto, cuerpo, programadoAt, enviadoAt: "", mensajeId: "", hiloId: "",
      error: sinResolver ? "faltan datos del lead: variables sin resolver" : "",
    });
    res.planificados++;
  }

  if (nuevos.length && !dryRun) await encolar(nuevos);

  // ---- 3. Envío ----------------------------------------------------------------
  if (!res.ventanaAbierta) {
    if (eventos.length && !dryRun) await registrarEventos(eventos);
    return res;
  }

  const listos = cola
    .filter((i) => i.estado === "aprobado" && i.programadoAt && new Date(i.programadoAt) <= new Date())
    .filter((i) => leadElegible(porId.get(i.leadId) ?? ({} as Lead)))
    .sort((a, b) => a.programadoAt.localeCompare(b.programadoAt));

  let enviadosTick = 0;

  for (const item of listos) {
    if (enviadosTick >= maxPorTick) break;
    const lead = porId.get(item.leadId);
    if (!lead) continue;
    if (cupoDisponible(cola, item.canal) <= 0) {
      res.omitidos.push(`${lead.id}: tope diario de ${item.canal} alcanzado`);
      continue;
    }

    if (dryRun) { res.enviados[item.canal]++; enviadosTick++; continue; }

    try {
      if (enviadosTick > 0) {
        const [min, max] = LIMITES.segundosEntreEnvios;
        await dormir((min + Math.random() * (max - min)) * 1000);
      }

      let mensajeId = "";
      let hiloId = "";

      if (item.canal === "email") {
        // Los seguimientos van dentro del hilo del primer correo.
        const previo = cola.find(
          (i) => i.leadId === lead.id && i.canal === "email" && i.estado === "enviado" && i.hiloId
        );
        const r = await enviarEmail({
          para: lead.email, asunto: item.asunto, cuerpo: item.cuerpo,
          hiloId: previo?.hiloId,
        });
        mensajeId = r.mensajeId;
        hiloId = r.hiloId;
      } else {
        const plantilla = plantillaDePaso(plantillas, item.paso);
        const params = item.cuerpo ? item.cuerpo.split("|") : [];
        mensajeId = plantilla?.waTemplate
          ? await enviarPlantilla({
              telefono: lead.telefono, template: plantilla.waTemplate,
              idioma: plantilla.waIdioma, params,
            })
          : await enviarTexto(lead.telefono, item.asunto);
      }

      const ts = ahora();
      await actualizarItem(item, { estado: "enviado", enviadoAt: ts, mensajeId, hiloId, error: "" });
      await actualizarLead(lead, { estado: "en_secuencia", pasoActual: item.paso, ultimoEnvioAt: ts });

      item.estado = "enviado";
      item.enviadoAt = ts;
      item.hiloId = hiloId;
      lead.pasoActual = item.paso;
      lead.ultimoEnvioAt = ts;

      res.enviados[item.canal]++;
      enviadosTick++;
      eventos.push({ ts, leadId: lead.id, tipo: "enviado", canal: item.canal, detalle: `paso ${item.paso}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.errores.push(`${lead.id} paso ${item.paso}: ${msg}`);
      await actualizarItem(item, { estado: "error", error: msg }).catch(() => {});
      eventos.push({ ts: ahora(), leadId: lead.id, tipo: "error", canal: item.canal, detalle: msg });
    }
  }

  if (eventos.length && !dryRun) await registrarEventos(eventos);
  return res;
}

/** Cancela lo pendiente de un lead (respondió, opt-out o pausa manual). */
export async function cancelarPendientes(
  cola: ItemCola[], leadId: string, motivo: string
): Promise<void> {
  const pendientes = cola.filter(
    (i) => i.leadId === leadId && (i.estado === "borrador" || i.estado === "aprobado")
  );
  for (const p of pendientes) {
    await actualizarItem(p, { estado: "cancelado", error: motivo });
    p.estado = "cancelado";
  }
}

/** Marca respuesta entrante (usado por el webhook de WhatsApp). */
export async function marcarRespuesta(telefono: string, texto: string): Promise<boolean> {
  const [leads, cola] = await Promise.all([leerLeads(), leerCola()]);
  const digits = telefono.replace(/[^0-9]/g, "");
  const lead = leads.find((l) => l.telefono && (l.telefono === digits || digits.endsWith(l.telefono)));
  if (!lead) return false;

  const optOut = /\b(baja|stop|no me escrib|elimin|no gracias|unsubscribe)\b/i.test(texto);
  await actualizarLead(lead, { estado: optOut ? "opt_out" : "respondio" });
  await cancelarPendientes(cola, lead.id, optOut ? "opt-out" : "lead respondió");
  await registrarEventos([
    { ts: ahora(), leadId: lead.id, tipo: optOut ? "opt_out" : "respondio", canal: "whatsapp", detalle: texto.slice(0, 200) },
  ]);
  return true;
}
