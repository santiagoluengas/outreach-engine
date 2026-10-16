import { WHATSAPP } from "./config";

const url = () =>
  `https://graph.facebook.com/${WHATSAPP.apiVersion}/${WHATSAPP.phoneNumberId}/messages`;

async function post(payload: unknown): Promise<string> {
  const res = await fetch(url(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    messages?: { id: string }[];
    error?: { message: string; code: number };
  };
  if (!res.ok || data.error) {
    throw new Error(`WhatsApp ${res.status}: ${data.error?.message ?? "error desconocido"}`);
  }
  return data.messages?.[0]?.id ?? "";
}

/** Único camino válido para iniciar conversación en frío: plantilla aprobada en Meta. */
export function enviarPlantilla(opts: {
  telefono: string;
  template: string;
  idioma: string;
  params: string[];
}): Promise<string> {
  return post({
    messaging_product: "whatsapp",
    to: opts.telefono,
    type: "template",
    template: {
      name: opts.template,
      language: { code: opts.idioma },
      ...(opts.params.length
        ? {
            components: [
              {
                type: "body",
                parameters: opts.params.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  });
}

/** Solo válido dentro de la ventana de 24h tras un mensaje del lead. */
export function enviarTexto(telefono: string, texto: string): Promise<string> {
  return post({
    messaging_product: "whatsapp",
    to: telefono,
    type: "text",
    text: { preview_url: false, body: texto },
  });
}
