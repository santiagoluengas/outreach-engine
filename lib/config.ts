/** Configuración central. Todo lo editable en caliente vive en el Sheet; aquí solo van
 *  límites duros y credenciales. */

export const TZ = "America/Bogota";

/** Ventana de envío permitida (hora local Bogotá, días hábiles). Fuera de esto no se
 *  envía nada: el mensaje espera al siguiente tick válido. */
export const VENTANA = { horaInicio: 8, horaFin: 18, diasHabiles: [1, 2, 3, 4, 5] };

/** Topes diarios por canal. Conservadores a propósito: reputación de dominio y
 *  calidad del número de WhatsApp se queman rápido y se recuperan lento. */
export const LIMITES = {
  emailPorDia: Number(process.env.MAX_EMAIL_DIA ?? 40),
  whatsappPorDia: Number(process.env.MAX_WA_DIA ?? 25),
  /** Envíos máximos por ejecución del cron. Con 5 ticks/día esto acota el volumen real. */
  porTick: Number(process.env.MAX_POR_TICK ?? 6),
  /** Espaciado aleatorio entre envíos consecutivos, en segundos (evita ráfagas). */
  segundosEntreEnvios: [
    Number(process.env.MIN_SEG_ENTRE_ENVIOS ?? 4),
    Number(process.env.MAX_SEG_ENTRE_ENVIOS ?? 9),
  ] as [number, number],
};

/** Meta EXIGE opt-in previo por política. Poner "no" asume el riesgo de calidad del
 *  número a cambio de poder abrir en frío por WhatsApp; en ese modo solo se excluyen
 *  los leads marcados explícitamente con opt_in_whatsapp = no. */
export const EXIGIR_OPT_IN_WA = (process.env.EXIGIR_OPT_IN_WA ?? "no") !== "no";

/** Solo el paso 1 pasa por aprobación manual; los seguimientos salen solos.
 *  (Modo "mixto".) Subir este número si querés aprobar más pasos. */
export const PASOS_CON_APROBACION = Number(process.env.PASOS_CON_APROBACION ?? 1);

export const SHEET_ID = required("SHEET_ID");
export const PESTANAS = {
  leads: "Leads",
  cola: "Cola",
  eventos: "Eventos",
  plantillas: "Plantillas",
} as const;

export const GOOGLE = {
  serviceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  privateKey: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
};

export const GMAIL = {
  clientId: required("GMAIL_CLIENT_ID"),
  clientSecret: required("GMAIL_CLIENT_SECRET"),
  refreshToken: required("GMAIL_REFRESH_TOKEN"),
  remitente: required("GMAIL_REMITENTE"),
  nombreRemitente: process.env.GMAIL_NOMBRE_REMITENTE ?? "Santiago Luengas",
};

export const WHATSAPP = {
  phoneNumberId: required("WA_PHONE_NUMBER_ID"),
  token: required("WA_TOKEN"),
  verifyToken: required("WA_VERIFY_TOKEN"),
  apiVersion: process.env.WA_API_VERSION ?? "v21.0",
};

export const CRON_SECRET = process.env.CRON_SECRET ?? "";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Ver .env.example`);
  return v;
}
