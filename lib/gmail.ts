import { google, gmail_v1 } from "googleapis";
import { GMAIL } from "./config";

let _gmail: gmail_v1.Gmail | null = null;

function client(): gmail_v1.Gmail {
  if (_gmail) return _gmail;
  const auth = new google.auth.OAuth2(GMAIL.clientId, GMAIL.clientSecret);
  auth.setCredentials({ refresh_token: GMAIL.refreshToken });
  _gmail = google.gmail({ version: "v1", auth });
  return _gmail;
}

const b64url = (s: string) =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Asunto con acentos: RFC 2047. */
const asuntoMime = (s: string) =>
  /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

async function messageIdRfc(threadId: string): Promise<string | null> {
  const hilo = await client().users.threads.get({
    userId: "me", id: threadId, format: "metadata", metadataHeaders: ["Message-ID"],
  });
  const msgs = hilo.data.messages ?? [];
  const ultimo = msgs[msgs.length - 1];
  return ultimo?.payload?.headers?.find((h) => h.name?.toLowerCase() === "message-id")?.value ?? null;
}

export async function enviarEmail(opts: {
  para: string;
  asunto: string;
  cuerpo: string;
  /** Si viene, el correo se envía dentro del mismo hilo (seguimiento). */
  hiloId?: string;
}): Promise<{ mensajeId: string; hiloId: string }> {
  const headers = [
    `From: ${GMAIL.nombreRemitente} <${GMAIL.remitente}>`,
    `To: ${opts.para}`,
    `Subject: ${asuntoMime(opts.asunto)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  if (opts.hiloId) {
    const ref = await messageIdRfc(opts.hiloId).catch(() => null);
    if (ref) headers.push(`In-Reply-To: ${ref}`, `References: ${ref}`);
  }

  const raw = b64url(
    headers.join("\r\n") + "\r\n\r\n" + Buffer.from(opts.cuerpo, "utf8").toString("base64")
  );

  const res = await client().users.messages.send({
    userId: "me",
    requestBody: { raw, ...(opts.hiloId ? { threadId: opts.hiloId } : {}) },
  });

  return { mensajeId: res.data.id ?? "", hiloId: res.data.threadId ?? "" };
}

/** Hilos que recibieron respuesta del lead (cualquier mensaje que no salió de nosotros). */
export async function hilosConRespuesta(hiloIds: string[]): Promise<Set<string>> {
  const conRespuesta = new Set<string>();
  const unicos = [...new Set(hiloIds.filter(Boolean))];

  for (const id of unicos) {
    try {
      const hilo = await client().users.threads.get({
        userId: "me", id, format: "metadata", metadataHeaders: ["From"],
      });
      const msgs = hilo.data.messages ?? [];
      const ajeno = msgs.some((m) => {
        const from = m.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        return !from.toLowerCase().includes(GMAIL.remitente.toLowerCase());
      });
      if (ajeno) conRespuesta.add(id);
    } catch {
      // Hilo borrado o sin acceso: no bloquea el tick.
    }
  }
  return conRespuesta;
}
