/** Dispara el motor contra el servidor local. `npm run tick -- --dry` para simular. */
const dry = process.argv.includes("--dry") ? "?dry=1" : "";
const url = `http://localhost:3002/api/cron${dry}`;
const res = await fetch(url).catch(() => null);
if (!res) {
  console.error("No hay servidor en localhost:3002. Corré `npm run dev` primero.");
  process.exit(1);
}
console.log(JSON.stringify(await res.json(), null, 2));
