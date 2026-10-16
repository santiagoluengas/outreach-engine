export type Canal = "email" | "whatsapp";

export type EstadoLead =
  | "nuevo"
  | "en_secuencia"
  | "respondio"
  | "terminado"
  | "opt_out"
  | "pausado";

export type EstadoCola =
  | "borrador"    // esperando tu aprobación
  | "aprobado"    // listo para salir cuando toque
  | "enviado"
  | "cancelado"
  | "error";

export interface Lead {
  id: string;
  nombre: string;
  empresa: string;
  cargo: string;
  email: string;
  /** E.164 sin '+', como lo exige la Cloud API: 573001234567 */
  telefono: string;
  industria: string;
  /** Gancho específico del lead; es lo que hace que el mensaje no parezca masivo. */
  contexto: string;
  fuente: string;
  estado: EstadoLead;
  pasoActual: number;
  /** "si" | "no" — consentimiento explícito para WhatsApp (exigido por Meta). */
  optInWhatsapp: string;
  ultimoEnvioAt: string;
  creadoAt: string;
  notas: string;
  /** Número de fila en el Sheet (1-indexed). No se persiste; se calcula al leer. */
  _fila: number;
}

export interface ItemCola {
  id: string;
  leadId: string;
  canal: Canal;
  paso: number;
  estado: EstadoCola;
  asunto: string;
  cuerpo: string;
  /** ISO. Momento a partir del cual se puede enviar. */
  programadoAt: string;
  enviadoAt: string;
  /** messageId de Gmail o wamid de WhatsApp. */
  mensajeId: string;
  /** threadId de Gmail: sirve para enhebrar seguimientos y detectar respuestas. */
  hiloId: string;
  error: string;
  _fila: number;
}

export interface Plantilla {
  paso: number;
  canal: Canal;
  /** Días de espera desde el envío del paso anterior (0 para el paso 1). */
  delayDias: number;
  asunto: string;
  cuerpo: string;
  /** Nombre de la plantilla aprobada en Meta. Obligatorio para iniciar en WhatsApp. */
  waTemplate: string;
  waIdioma: string;
  activa: boolean;
}

export interface Evento {
  ts: string;
  leadId: string;
  tipo: string;
  canal: string;
  detalle: string;
}
