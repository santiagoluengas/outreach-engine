import { NextRequest, NextResponse } from "next/server";
import { CRON_SECRET } from "@/lib/config";
import { tick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron manda `Authorization: Bearer $CRON_SECRET`.
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "no autorizado" }, { status: 401 });
    }
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  try {
    const resumen = await tick({ dryRun });
    return NextResponse.json({ ok: true, dryRun, ...resumen });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
