export function minutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Hora inválida");
  const [h,m]=value.split(":").map(Number);
  return h*60+m;
}
export function validateReservation(item) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error("Fecha inválida");
  const parsed = new Date(item.date+"T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==item.date) throw new Error("Fecha inválida");
  if (typeof item.aircraft!=="string" || !item.aircraft.trim() || typeof item.person!=="string" || !item.person.trim()) throw new Error("Completá aeronave y responsable");
  if (item.mode !== undefined && !["instruccion","solo"].includes(item.mode)) throw new Error("Modalidad inválida");
  if (item.mode === "instruccion" && (typeof item.instructor !== "string" || !item.instructor.trim())) throw new Error("Seleccioná un instructor");
  if (minutes(item.start)>=minutes(item.end)) throw new Error("La hora final debe ser posterior a la inicial");
}
export function overlaps(a,b) {
  return a.aircraft===b.aircraft && a.date===b.date && minutes(a.start)<minutes(b.end) && minutes(b.start)<minutes(a.end);
}
export function reserve(item, reservations, blockedAircraft) {
  validateReservation(item);
  if (blockedAircraft.includes(item.aircraft)) throw new Error("Aeronave no disponible por bloqueo administrativo");
  if (item.mode === "instruccion" && reservations.some(existing => existing.mode === "instruccion" && existing.instructor === item.instructor && existing.date === item.date && minutes(existing.start) < minutes(item.end) && minutes(item.start) < minutes(existing.end))) throw new Error("Instructor ocupado en ese horario");
  if (reservations.some(existing=>overlaps(existing,item))) throw new Error("Horario ocupado para esta aeronave");
  return [...reservations, {...item, id: crypto.randomUUID()}];
}

export function cancelReservation(id, reservations) {
  if (typeof id !== "string" || !reservations.some(item => item.id === id)) throw new Error("Reserva inexistente");
  return reservations.filter(item => item.id !== id);
}
export function reservationsCsv(reservations) {
  const escape = value => '"' + String(value ?? "").replace(/"/g, '""').replace(/^[=+@\-\t\r]/, "'$&") + '"';
  const lines = [["Aeronave","Fecha","Desde","Hasta","Responsable"], ...reservations.map(item => [item.aircraft,item.date,item.start,item.end,item.person])];
  return "\uFEFF" + lines.map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
