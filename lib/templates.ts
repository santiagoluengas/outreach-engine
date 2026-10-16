import type { Lead, Plantilla } from "./types";

/** Variables disponibles en las plantillas. */
export function variables(lead: Lead): Record<string, string> {
  const primerNombre = lead.nombre.trim().split(/\s+/)[0] ?? "";
  return {
    nombre: lead.nombre,
    primer_nombre: primerNombre,
    empresa: lead.empresa,
    cargo: lead.cargo,
    industria: lead.industria,
    contexto: lead.contexto,
  };
}

export function render(plantilla: string, lead: Lead): string {
  const vars = variables(lead);
  return plantilla.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, clave: string) => {
    const v = vars[clave];
    return v === undefined || v === "" ? m : v;
  });
}

/** Para WhatsApp, `cuerpo` de la plantilla es la lista de parámetros del template
 *  de Meta separados por "|", en orden: "{{primer_nombre}}|{{empresa}}". */
export function paramsWhatsapp(plantilla: Plantilla, lead: Lead): string[] {
  if (!plantilla.cuerpo.trim()) return [];
  return plantilla.cuerpo.split("|").map((p) => render(p.trim(), lead));
}

export function plantillaDePaso(
  plantillas: Plantilla[],
  paso: number
): Plantilla | undefined {
  return plantillas.find((p) => p.paso === paso);
}
