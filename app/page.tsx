import Bandeja, { type Pendiente } from "./bandeja";
import { leerCola, leerLeads } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [cola, leads] = await Promise.all([leerCola(), leerLeads()]);
  const porId = new Map(leads.map((l) => [l.id, l]));

  const items: Pendiente[] = cola
    .filter((i) => i.estado === "borrador")
    .sort((a, b) => a.programadoAt.localeCompare(b.programadoAt))
    .map((i) => {
      const lead = porId.get(i.leadId);
      return {
        id: i.id,
        lead: lead?.nombre ?? i.leadId,
        empresa: lead?.empresa ?? "",
        destino: i.canal === "email" ? lead?.email ?? "" : lead?.telefono ?? "",
        canal: i.canal,
        paso: i.paso,
        asunto: i.asunto,
        cuerpo: i.cuerpo,
        programadoAt: i.programadoAt,
        aviso: i.error,
      };
    });

  const enSecuencia = leads.filter((l) => l.estado === "en_secuencia").length;
  const respondieron = leads.filter((l) => l.estado === "respondio").length;

  return (
    <main>
      <h1>Bandeja de aprobación</h1>
      <p className="sub">
        {items.length} por aprobar · {enSecuencia} en secuencia · {respondieron} respondieron
      </p>
      <Bandeja items={items} />
    </main>
  );
}
