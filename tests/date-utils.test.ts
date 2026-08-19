import { describe, expect, it } from "vitest";

import {
  addDays,
  formatWeekRange,
  getWeekDates,
  getWeekStart,
  suggestMealForNow,
  toISODate,
} from "../lib/date-utils";

describe("getWeekStart", () => {
  it("devuelve el lunes de la semana para un miércoles", () => {
    const wednesday = new Date(2026, 7, 12); // 12 de agosto de 2026, miércoles
    expect(toISODate(getWeekStart(wednesday))).toBe("2026-08-10");
  });

  it("devuelve el lunes anterior para un domingo", () => {
    const sunday = new Date(2026, 7, 16);
    expect(toISODate(getWeekStart(sunday))).toBe("2026-08-10");
  });

  it("es idempotente sobre un lunes", () => {
    const monday = new Date(2026, 7, 10);
    expect(toISODate(getWeekStart(monday))).toBe("2026-08-10");
  });
});

describe("getWeekDates", () => {
  it("devuelve siete fechas consecutivas", () => {
    const dates = getWeekDates(new Date(2026, 7, 10));
    expect(dates).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });
});

describe("addDays", () => {
  it("cruza correctamente el cambio de mes", () => {
    expect(toISODate(addDays(new Date(2026, 7, 30), 3))).toBe("2026-09-02");
  });
});

describe("formatWeekRange", () => {
  it("usa un solo mes cuando la semana no lo cruza", () => {
    expect(formatWeekRange(new Date(2026, 7, 10))).toBe("10 al 16 de agosto");
  });

  it("menciona ambos meses cuando la semana los cruza", () => {
    expect(formatWeekRange(new Date(2026, 7, 31))).toContain("agosto");
    expect(formatWeekRange(new Date(2026, 7, 31))).toContain("septiembre");
  });
});

describe("suggestMealForNow", () => {
  it("sugiere desayuno a la mañana temprano", () => {
    expect(suggestMealForNow(new Date(2026, 7, 12, 8, 0))).toBe("desayuno");
  });

  it("sugiere almuerzo al mediodía", () => {
    expect(suggestMealForNow(new Date(2026, 7, 12, 13, 0))).toBe("almuerzo");
  });

  it("sugiere merienda a la tarde", () => {
    expect(suggestMealForNow(new Date(2026, 7, 12, 17, 0))).toBe("merienda");
  });

  it("sugiere cena a la noche", () => {
    expect(suggestMealForNow(new Date(2026, 7, 12, 21, 0))).toBe("cena");
  });
});

