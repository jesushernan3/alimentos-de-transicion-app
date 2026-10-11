import { describe, expect, it, beforeEach } from "vitest";
import vm from "node:vm";
import { ADMIN_CLIENT_JS } from "../server/admin-client";

type StubElement = {
  innerHTML: string;
  textContent: string;
  className: string;
  style: Record<string, string>;
  classList: { add: (...names: string[]) => void; remove: (...names: string[]) => void };
  addEventListener: () => void;
  querySelectorAll: () => StubElement[];
  dataset: Record<string, string>;
};

type AdminTestContext = vm.Context & {
  __elements: Map<string, StubElement>;
  __fetch: (input: string) => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>;
  __payload: unknown;
  __adminTest: {
    MAX_ACTIVE_DEVICES: number;
    deviceState: (device: Record<string, unknown>) => string;
    deviceDisplayName: (device: Record<string, unknown>) => string;
    compactDeviceId: (value: unknown) => string;
    deviceCardHtml: (device: Record<string, unknown>) => string;
    renderUsersTable: (users: Array<Record<string, unknown>>) => void;
    showDevices: (licenseId: number, email: string) => Promise<void>;
  };
};

function element(): StubElement {
  return {
    innerHTML: "",
    textContent: "",
    className: "",
    style: {},
    classList: { add: () => undefined, remove: () => undefined },
    addEventListener: () => undefined,
    querySelectorAll: () => [],
    dataset: {},
  };
}

function loadAdminClient(): AdminTestContext {
  const elements = new Map<string, StubElement>();
  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id)!;
  };
  const document = {
    getElementById: getElement,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
  };
  const context = vm.createContext({
    document,
    window: { location: { href: "" } },
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    confirm: () => true,
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ catalog: {}, licenses: {} }),
    }),
  }) as AdminTestContext;
  context.__elements = elements;
  context.__payload = { catalog: {}, licenses: {} };
  context.__fetch = async (input: string) => {
    void input;
    return { status: 200, ok: true, json: async () => context.__payload };
  };
  context.fetch = context.__fetch;

  vm.runInContext(
    `${ADMIN_CLIENT_JS}\n` +
      `globalThis.__adminTest = { MAX_ACTIVE_DEVICES, deviceState, deviceDisplayName, compactDeviceId, deviceCardHtml, renderUsersTable, showDevices };`,
    context,
  );
  return context;
}

describe("detalle de dispositivos del admin", () => {
  let context: AdminTestContext;

  beforeEach(() => {
    context = loadAdminClient();
  });

  it("mantiene el límite 3 en el contador del listado y en el detalle", () => {
    expect(context.__adminTest.MAX_ACTIVE_DEVICES).toBe(3);

    context.__adminTest.renderUsersTable([
      { email: "persona@example.com", status: "active", activeDeviceCount: 2, licenseId: 9 },
    ]);
    expect(context.__elements.get("users-table")!.innerHTML).toContain("2/3 · Ver");

    context.__payload = { devices: [], activeCount: 2, maxActiveDevices: 3 };
    return context.__adminTest.showDevices(9, "persona@example.com").then(() => {
      expect(context.__elements.get("modal")!.innerHTML).toContain("2/3 dispositivos activos");
    });
  });

  it("prioriza estados revokedAt, releasedAt y activo sin confundir liberados", () => {
    expect(context.__adminTest.deviceState({ revokedAt: "2026-01-03", releasedAt: "2026-01-02" })).toBe("revoked");
    expect(context.__adminTest.deviceState({ releasedAt: "2026-01-02" })).toBe("released");
    expect(context.__adminTest.deviceState({})).toBe("active");

    const released = context.__adminTest.deviceCardHtml({ releasedAt: "2026-01-02", deviceId: "12345678" });
    expect(released).toContain("Liberado");
    expect(released).not.toMatch(/pill-active[^>]*>Activo/);

    const revoked = context.__adminTest.deviceCardHtml({ revokedAt: "2026-01-03", deviceId: "12345678" });
    expect(revoked).toContain("Revocado administrativo");
  });

  it("renderiza los campos nuevos, nombre preferente y UUID abreviado", () => {
    const html = context.__adminTest.deviceCardHtml({
      id: 12,
      deviceId: "12345678-aaaa-bbbb-cccc-87654321",
      deviceLabel: "Etiqueta que no debe ganar",
      platform: "android",
      osVersion: "14",
      appVersion: "2.4.0",
      manufacturer: "Samsung",
      modelName: "Samsung Galaxy S24",
      modelId: "SM-S921B",
      registeredAt: "2026-01-01T10:00:00Z",
      lastActivityAt: "2026-01-02T10:00:00Z",
    });

    expect(html).toContain("Samsung Galaxy S24");
    expect(html).not.toContain("Samsung Samsung Galaxy S24");
    expect(html).toContain("Plataforma: android · 14");
    expect(html).toContain("App version: 2.4.0");
    expect(html).toContain("Modelo Android: SM-S921B");
    expect(html).toContain("Alta:");
    expect(html).toContain("Último uso:");
    expect(html).toContain("1234…4321");
    expect(html).not.toContain("12345678-aaaa-bbbb-cccc-87654321");
    expect(context.__adminTest.deviceDisplayName({ deviceLabel: "Pixel heredado", modelId: "oriole" })).toBe("Pixel heredado");
    expect(context.__adminTest.deviceDisplayName({ modelId: "oriole" })).toBe("oriole");
    expect(context.__adminTest.deviceDisplayName({})).toBe("Dispositivo sin modelo");
  });

  it("escapa strings de usuario y dispositivo en HTML real", async () => {
    context.__payload = {
      devices: [{
        id: "<device-id>",
        deviceId: "abcd1234<svg/onload=1>",
        deviceLabel: "<label>",
        platform: "<platform>",
        osVersion: "<os>",
        appVersion: "<app>",
        manufacturer: "<maker>",
        modelName: "<model>",
        modelId: "<model-id>",
        registeredAt: "2026-01-01T10:00:00Z",
        lastActivityAt: "2026-01-02T10:00:00Z",
      }],
      activeCount: 1,
      maxActiveDevices: 3,
    };

    await context.__adminTest.showDevices(9, "<admin@example.com>");
    const html = context.__elements.get("modal")!.innerHTML;
    expect(html).toContain("&lt;admin@example.com&gt;");
    expect(html).toContain("&lt;maker&gt; &lt;model&gt;");
    expect(html).not.toContain("<maker>");
    expect(html).not.toContain("<svg/onload=1>");
    expect(html).toContain("abcd…d=1&gt;");
  });

  it("conserva las rutas existentes para revocar y reactivar sin restaurar sesiones", () => {
    expect(ADMIN_CLIENT_JS).toContain("'/licenses/' + licenseId + '/devices/' + button.dataset.revokeDevice + '/revoke'");
    expect(ADMIN_CLIENT_JS).toContain("'/licenses/' + licenseId + '/devices/' + button.dataset.reactivateDevice + '/reactivate'");
    expect(ADMIN_CLIENT_JS).toContain("no se restauró la sesión anterior");
    expect(ADMIN_CLIENT_JS).toContain("data-revoke-device");
    expect(ADMIN_CLIENT_JS).toContain("state === 'active' || state === 'released'");
  });
});
