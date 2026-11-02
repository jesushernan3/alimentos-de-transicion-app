import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  recipes: [] as Array<{ id: string; slug: string; thumbUrl: string; imageUrl: string; category: string; dietTags: string[]; collectionSlugs: string[] }>,
  token: "fixture-session-123456", accessState: "signed-in", path: "/descarga-inicial",
  state: { lastSyncAt: null as string | null, lastSuccessAt: null as string | null, recipeFormatVersion: 2, catalogVersion: 0 },
  online: true, cached: new Set<string>(), callbacks: new Set<(value: { isOnline: boolean }) => void>(),
  emitInitially: false, subscriptions: 0,
  prefetch: vi.fn(), pull: vi.fn(), remote: vi.fn(), apply: vi.fn(), replace: vi.fn(), reads: vi.fn(),
  lastBackground: null as null | Promise<{ total: number; stored: number; failed: number }>,
}));
vi.mock("@/lib/access-context", () => ({ useAccess: () => ({ token: m.token, state: m.accessState }) }));
vi.mock("@/lib/user-data-context", () => ({ useUserData: () => ({ hydrated: true, onboardingSeen: true }) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: m.replace }), usePathname: () => m.path }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/resolve-asset-url", () => ({ resolveAssetUrl: (url?: string | null) => url?.trim() || null }));
vi.mock("@/lib/connectivity", () => ({
  getConnectivity: async () => ({ isOnline: m.online }),
  subscribeConnectivity: (callback: (value: { isOnline: boolean }) => void) => {
    m.callbacks.add(callback); m.subscriptions++;
    if (m.emitInitially) queueMicrotask(() => { if (m.callbacks.has(callback)) callback({ isOnline: m.online }); });
    return () => { m.callbacks.delete(callback); };
  },
}));
vi.mock("@/lib/installation-device", () => ({ getInstallationDeviceMetadata: async () => ({ deviceId: "fixture-device" }) }));
vi.mock("@/lib/device-revocation", () => ({ reportAccessRejection: vi.fn(), isDeviceRevoked: () => false, DEVICE_REVOKED_FEEDBACK: { message: "Dispositivo desactivado" } }));
vi.mock("@/lib/api-client", () => ({ api: { sync: { pull: { query: m.pull }, state: { query: m.remote } } } }));
vi.mock("@/lib/local-db/catalog-store", () => ({
  countRecipes: async () => m.recipes.length,
  getSyncState: async () => m.state,
  getAllRecipes: async () => { m.reads(); return [...m.recipes]; },
  getAllCollections: async () => [], getAllCategories: async () => [], getAllIngredients: async () => [],
  applyChanges: m.apply,
}));
vi.mock("@/lib/image-cache", () => ({
  prefetchInBackground: m.prefetch,
  isPrefetchRunning: () => m.lastBackground !== null,
  countMissingImages: async (urls: string[]) => urls.filter(url => !m.cached.has(url)).length,
}));
const { CatalogProvider, useCatalog } = await import("../lib/catalog-context");
const { AccessGate } = await import("../components/access-gate");
let view: ReactTestRenderer | null = null;
let catalog!: ReturnType<typeof useCatalog>;
const deferreds: Array<{ resolve: (value: { total: number; stored: number; failed: number }) => void }> = [];
function deferred() {
  let resolve!: (value: { total: number; stored: number; failed: number }) => void;
  const promise = new Promise<{ total: number; stored: number; failed: number }>(done => { resolve = done; });
  deferreds.push({ resolve }); return { promise, resolve };
}
function Probe() { catalog = useCatalog(); return React.createElement(AccessGate); }
async function mount() { await act(async () => { view = create(React.createElement(CatalogProvider, null, React.createElement(Probe))); }); }
async function drain() { await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); }); }
const recipe = { id: "one", slug: "one", thumbUrl: "/thumb.webp", imageUrl: "/cover.webp", category: "almuerzo", dietTags: [], collectionSlugs: [] };
beforeEach(() => {
  vi.stubGlobal("React", React); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.recipes = []; m.token = "fixture-session-123456"; m.accessState = "signed-in"; m.path = "/descarga-inicial";
  m.state = { lastSyncAt: null, lastSuccessAt: null, recipeFormatVersion: 2, catalogVersion: 0 };
  m.online = true; m.cached.clear(); m.callbacks.clear(); m.lastBackground = null; deferreds.length = 0;
  m.emitInitially = false; m.subscriptions = 0;
  for (const fn of [m.prefetch, m.pull, m.remote, m.apply, m.replace, m.reads]) fn.mockReset();
  m.pull.mockResolvedValue({ authorized: true, data: { recipes: [recipe], ingredients: [], collections: [], categories: [], dietTags: [], deletions: [], catalogVersion: 1, recipeFormatVersion: 2, serverTime: "2026-10-31T16:00:00.000Z" } });
  m.remote.mockResolvedValue({ catalogVersion: 0, publishedRecipes: 1, recipeFormatVersion: 2 });
  m.apply.mockImplementation(async input => {
    m.recipes = input.recipes; m.state = { lastSyncAt: input.serverTime, lastSuccessAt: input.serverTime, catalogVersion: input.catalogVersion, recipeFormatVersion: 2 };
  });
  m.prefetch.mockImplementation(async (urls: string[]) => {
    urls.forEach(url => m.cached.add(url)); return { total: urls.length, stored: urls.length, failed: 0 };
  });
});
afterEach(async () => {
  await act(async () => {
    for (const task of deferreds) task.resolve({ total: 1, stored: 1, failed: 0 });
    for (let i = 0; i < 30; i++) await Promise.resolve();
    view?.unmount(); view = null;
  });
});

describe("catálogo listo con miniaturas progresivas", () => {
  it("la compuerta abre Home tras textos sin esperar miniaturas ni portada", async () => {
    const essential = deferred(); const large = deferred();
    m.prefetch.mockImplementation((urls: string[]) => {
      if (urls.includes("/cover.webp")) {
        m.lastBackground = large.promise;
        return large.promise.finally(() => { m.lastBackground = null; });
      }
      return essential.promise;
    });
    await mount(); await drain();
    expect(m.apply).toHaveBeenCalledOnce();
    expect(catalog.hasContent).toBe(true); expect(catalog.initialSyncRunning).toBe(false);
    expect(m.replace).toHaveBeenCalledWith("/(tabs)"); expect(m.lastBackground).not.toBeNull();
    expect(m.cached.has("/thumb.webp")).toBe(false);
    expect(m.prefetch.mock.calls[0][0]).toEqual(["/thumb.webp"]);
    expect(m.prefetch.mock.calls[0][1]).toEqual({ priority: ["/thumb.webp"] });
    expect(m.prefetch.mock.calls[1]).toEqual([["/cover.webp"], { concurrency: 2 }]);
    const before = m.reads.mock.calls.length;
    await act(async () => { essential.resolve({ total: 1, stored: 1, failed: 0 }); }); await drain();
    expect(catalog.hasContent).toBe(true); expect(m.lastBackground).not.toBeNull();
    await act(async () => { large.resolve({ total: 1, stored: 1, failed: 0 }); }); await drain();
    expect(m.reads.mock.calls.length).toBeGreaterThan(before);
  });

  it("no habilita Home ni inicia miniaturas hasta confirmar el guardado local", async () => {
    const committed = deferred();
    m.apply.mockImplementation(async input => {
      await committed.promise;
      m.recipes = input.recipes;
      m.state = { lastSyncAt: input.serverTime, lastSuccessAt: input.serverTime, catalogVersion: input.catalogVersion, recipeFormatVersion: 2 };
    });
    await mount(); await drain();
    expect(catalog.hasContent).toBe(false); expect(catalog.initialSyncRunning).toBe(true);
    expect(m.prefetch).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalledWith("/(tabs)");
    await act(async () => { committed.resolve({ total: 0, stored: 0, failed: 0 }); }); await drain();
    expect(catalog.hasContent).toBe(true); expect(catalog.initialSyncRunning).toBe(false);
    expect(m.replace).toHaveBeenCalledWith("/(tabs)");
  });

  it("al reabrir con contenido retoma fotos sin volver a pedir el catálogo completo", async () => {
    m.recipes = [recipe]; m.cached.add("/thumb.webp");
    await mount(); await drain();
    expect(catalog.hasContent).toBe(true); expect(m.pull).not.toHaveBeenCalled();
    expect(m.prefetch).toHaveBeenCalledWith(["/thumb.webp", "/cover.webp"], { priority: ["/thumb.webp"], concurrency: 2 });
    expect(m.cached.has("/cover.webp")).toBe(true);
  });

  it("al reconectar completa pendientes sin bloquear recetas ya guardadas", async () => {
    m.recipes = [recipe]; m.online = false;
    await mount(); await drain(); expect(catalog.hasContent).toBe(true); expect(m.prefetch).not.toHaveBeenCalled();
    m.online = true;
    await act(async () => { for (const cb of [...m.callbacks]) cb({ isOnline: true }); }); await drain();
    expect(m.prefetch).toHaveBeenCalledOnce(); expect(catalog.hasContent).toBe(true); expect(m.pull).not.toHaveBeenCalled();
  });

  it("el refresco tras fotos fallidas no vuelve a suscribir NetInfo ni provoca reintentos infinitos", async () => {
    m.recipes = [recipe]; m.online = false; m.emitInitially = true;
    await mount(); await drain();
    const subscribed = m.subscriptions;
    m.prefetch.mockResolvedValue({ total: 2, stored: 0, failed: 2 });
    m.online = true;
    await act(async () => { for (const cb of [...m.callbacks]) cb({ isOnline: true }); }); await drain();
    expect(m.prefetch).toHaveBeenCalledOnce(); expect(catalog.hasContent).toBe(true);
    expect(m.subscriptions).toBe(subscribed);
  });

  it("dispositivo revocado con catálogo físico no queda autorizado", async () => {
    m.recipes = [recipe]; m.accessState = "device-revoked"; m.path = "/(tabs)";
    await mount(); await drain();
    expect(catalog.hasContent).toBe(true); expect(m.replace).toHaveBeenCalledWith("/acceso");
    expect(m.pull).not.toHaveBeenCalled(); expect(m.prefetch).not.toHaveBeenCalled();
  });

  it("no refresca desde un callback diferido de una sesión cerrada", async () => {
    const large = deferred();
    m.prefetch.mockImplementation((urls: string[]) => urls.includes("/cover.webp") ? large.promise : Promise.resolve({ total: 1, stored: 1, failed: 0 }));
    await mount(); await drain(); expect(catalog.hasContent).toBe(true);
    m.accessState = "signed-out"; m.token = "";
    await act(async () => { view!.update(React.createElement(CatalogProvider, null, React.createElement(Probe))); });
    const before = m.reads.mock.calls.length;
    await act(async () => { large.resolve({ total: 1, stored: 1, failed: 0 }); }); await drain();
    expect(m.reads).toHaveBeenCalledTimes(before);
    expect(m.prefetch).toHaveBeenCalledTimes(2);
  });
});
