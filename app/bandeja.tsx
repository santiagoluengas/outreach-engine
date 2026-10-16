"use client";

import { useState } from "react";

export interface Pendiente {
  id: string;
  lead: string;
  empresa: string;
  destino: string;
  canal: string;
  paso: number;
  asunto: string;
  cuerpo: string;
  programadoAt: string;
  aviso: string;
}

export default function Bandeja({ items }: { items: Pendiente[] }) {
  const [pendientes, setPendientes] = useState(items);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function actuar(item: Pendiente, accion: "aprobar" | "rechazar") {
    setOcupado(item.id);
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, accion, asunto: item.asunto, cuerpo: item.cuerpo }),
    });
    setOcupado(null);
    if (res.ok) setPendientes((p) => p.filter((x) => x.id !== item.id));
    else alert("No se pudo: " + (await res.text()));
  }

  function editar(id: string, campo: "asunto" | "cuerpo", valor: string) {
    setPendientes((p) => p.map((x) => (x.id === id ? { ...x, [campo]: valor } : x)));
  }

  if (pendientes.length === 0) {
    return <p className="vacio">Nada pendiente de aprobación.</p>;
  }

  return (
    <>
      {pendientes.map((item) => (
        <div className="card" key={item.id}>
          <div className="fila">
            <div>
              <strong>{item.lead}</strong>{" "}
              <span className="meta">· {item.empresa} · {item.destino}</span>
            </div>
            <span className="chip">{item.canal} · paso {item.paso}</span>
          </div>

          {item.aviso && <div className="aviso">{item.aviso}</div>}

          <input
            type="text"
            value={item.asunto}
            onChange={(e) => editar(item.id, "asunto", e.target.value)}
            placeholder={item.canal === "email" ? "Asunto" : "Vista previa de la plantilla"}
          />
          <textarea
            value={item.cuerpo}
            onChange={(e) => editar(item.id, "cuerpo", e.target.value)}
            placeholder={item.canal === "email" ? "Cuerpo" : "Parámetros de la plantilla separados por |"}
          />

          <div className="fila">
            <span className="meta">
              Sale el {new Date(item.programadoAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
            </span>
            <span className="acciones">
              <button className="secundario" disabled={ocupado === item.id} onClick={() => actuar(item, "rechazar")}>
                Descartar
              </button>
              <button className="primario" disabled={ocupado === item.id} onClick={() => actuar(item, "aprobar")}>
                {ocupado === item.id ? "..." : "Aprobar"}
              </button>
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
