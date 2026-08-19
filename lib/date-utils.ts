/** Nombres de los días de la semana, empezando por lunes. */
export const WEEKDAY_NAMES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Devuelve la fecha en formato YYYY-MM-DD usando la zona horaria local. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** Devuelve el lunes de la semana a la que pertenece la fecha dada. */
export function getWeekStart(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay(); // 0 domingo … 6 sábado
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/** Devuelve las siete fechas ISO de la semana que arranca en `weekStart`. */
export function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, index) => toISODate(addDays(weekStart, index)));
}

/** Rótulo legible del rango semanal, por ejemplo "10 al 16 de agosto". */
export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const startDay = weekStart.getDate();
  const endDay = end.getDate();
  const startMonth = MONTH_NAMES[weekStart.getMonth()];
  const endMonth = MONTH_NAMES[end.getMonth()];

  if (startMonth === endMonth) {
    return `${startDay} al ${endDay} de ${endMonth}`;
  }
  return `${startDay} de ${startMonth} al ${endDay} de ${endMonth}`;
}

/** Rótulo corto de una fecha, por ejemplo "12 de agosto". */
export function formatLongDate(value: string): string {
  const date = parseISODate(value);
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
}

export function isToday(value: string): boolean {
  return value === toISODate(new Date());
}

/**
 * Sugiere la comida más probable según la hora del día. Se usa para el
 * subtítulo de la pantalla de inicio y para preseleccionar en el planificador.
 */
export function suggestMealForNow(date = new Date()): "desayuno" | "almuerzo" | "merienda" | "cena" {
  const hour = date.getHours();
  if (hour < 11) return "desayuno";
  if (hour < 15) return "almuerzo";
  if (hour < 19) return "merienda";
  return "cena";
}
