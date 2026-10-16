import { NextRequest, NextResponse } from "next/server";
import { actualizarItem, leerCola, registrarEventos } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    itemId: string;
    accion: "aprobar" | "rechazar";
    asunto?: string;
    cuerpo?: string;
  };

  const cola = await leerCola();
  const item = cola.find((i) => i.id === body.itemId);
  if (!item) return NextResponse.json({ error: "item no encontrado" }, { status: 404 });
  if (item.estado !== "borrador") {
    return NextResponse.json({ error: `el item ya está en estado ${item.estado}` }, { status: 409 });
  }

  if (body.accion === "rechazar") {
    await actualizarItem(item, { estado: "cancelado", error: "rechazado manualmente" });
  } else {
    await actualizarItem(item, {
      estado: "aprobado",
      asunto: body.asunto ?? item.asunto,
      cuerpo: body.cuerpo ?? item.cuerpo,
      error: "",
    });
  }

  await registrarEventos([{
    ts: new Date().toISOString(), leadId: item.leadId,
    tipo: body.accion === "aprobar" ? "aprobado" : "rechazado",
    canal: item.canal, detalle: `paso ${item.paso}`,
  }]);

  return NextResponse.json({ ok: true });
}
