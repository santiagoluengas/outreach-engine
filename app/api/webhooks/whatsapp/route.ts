import { NextRequest, NextResponse } from "next/server";
import { WHATSAPP } from "@/lib/config";
import { marcarRespuesta } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

/** Verificación del webhook que exige Meta al configurarlo. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === WHATSAPP.verifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

interface PayloadWA {
  entry?: {
    changes?: {
      value?: {
        messages?: { from: string; type: string; text?: { body: string } }[];
        statuses?: { status: string; errors?: { title: string }[] }[];
      };
    }[];
  }[];
}

export async function POST(req: NextRequest) {
  // Siempre 200: si Meta ve errores repetidos, desactiva el webhook.
  try {
    const body = (await req.json()) as PayloadWA;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          const texto = msg.text?.body ?? `[${msg.type}]`;
          await marcarRespuesta(msg.from, texto);
        }
      }
    }
  } catch (e) {
    console.error("webhook whatsapp:", e);
  }
  return NextResponse.json({ ok: true });
}
