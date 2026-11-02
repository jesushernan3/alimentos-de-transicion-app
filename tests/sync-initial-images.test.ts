import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  files: new Map<string, number>(), downloads: [] as string[],
  barriers: new Map<string, { promise: Promise<void>; resolve: () => void }>(),
  online: true, count: 0, applied: false,
  state: { lastSyncAt: null as string | null, catalogVersion: 0, recipeFormatVersion: 2 },
  pull: vi.fn(), apply: vi.fn(), track: vi.fn(), rejectAccess: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/lib/resolve-asset-url", () => ({
  resolveAssetUrl: (url?: string | null) => {
    const value = url?.trim();
    if (!value) return null;
    return /^(https?:\/\/|file:\/\/)/.test(value) ? value : `https://server.test${value.startsWith("/") ? "" : "/"}${value}`;
  },
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/",
  getInfoAsync: async (path: string) => path.endsWith("/")
    ? { exists: true, isDirectory: true }
    : { exists: m.files.has(path), isDirectory: false, size: m.files.get(path) ?? 0 },
  makeDirectoryAsync: async () => undefined,
  downloadAsync: async (url: string, path: string) => {
    m.downloads.push(url);
    await m.barriers.get(url)?.promise;
    if (!m.online) throw new Error("network offline");
    m.files.set(path, 4096);
    return { status: 200, uri: path };
  },
  deleteAsync: async (path: string) => { m.files.delete(path); },
  readDirectoryAsync: async () => [],
}));
vi.mock("@/lib/api-client", () => ({ api: { sync: { pull: { query: m.pull }, state: { query: vi.fn() } } } }));
vi.mock("@/lib/connectivity", () => ({ getConnectivity: async () => ({ isOnline: m.online }) }));
vi.mock("@/lib/installation-device", () => ({ getInstallationDeviceMetadata: async () => ({ deviceId: "test-installation-device" }) }));
vi.mock("@/lib/local-db/catalog-store", () => ({ countRecipes: async () => m.count, getSyncState: async () => m.state, applyChanges: m.apply }));
vi.mock("@/lib/analytics", () => ({ trackEvent: m.track }));
vi.mock("@/lib/device-revocation", () => ({
  reportAccessRejection: m.rejectAccess,
  isDeviceRevoked: (response: { reason?: string }) => response?.reason === "device-revoked",
  DEVICE_REVOKED_FEEDBACK: { message: "Este dispositivo fue desactivado" },
}));

const { syncCatalog, isSyncRunning } = await import("../lib/sync-engine");
const { catalogImagePlan } = await import("../lib/catalog-image-plan");
const { getCachedImage, countMissingImages, prefetchInBackground, isPrefetchRunning, __resetImageCacheIndex } = await import("../lib/image-cache");
const TOKEN = "test-session-not-real-123456";
const jobs: Promise<unknown>[] = [];
function barrier(url: string) {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  const entry = { promise, resolve };
  m.barriers.set(`https://server.test${url}`, entry);
  return entry;
}
function data(recipes = [{ slug: "one", thumbUrl: "/thumb.webp", imageUrl: "/cover.webp" }]) {
  return {
    recipes, ingredients: [], collections: [{ imageUrl: "/collection.webp" }],
    categories: [{ imageUrl: "/category.webp" }], dietTags: [], deletions: [],
    catalogVersion: 2, recipeFormatVersion: 2, serverTime: "2026-10-31T16:00:00.000Z",
  };
}
function start(options: Parameters<typeof syncCatalog>[1] = {}) {
  const job = syncCatalog(TOKEN, options); jobs.push(job); return job;
}
beforeEach(() => {
  __resetImageCacheIndex(); jobs.length = 0;
  m.files.clear(); m.downloads.length = 0; m.barriers.clear(); m.online = true; m.count = 0; m.applied = false;
  m.state = { lastSyncAt: null, catalogVersion: 0, recipeFormatVersion: 2 };
  m.pull.mockReset(); m.apply.mockReset(); m.track.mockReset(); m.rejectAccess.mockReset();
  m.pull.mockResolvedValue({ authorized: true, status: "active", data: data() });
  m.apply.mockImplementation(async (input) => {
    m.applied = true; m.count = input.recipes.length;
    m.state = { lastSyncAt: input.serverTime, catalogVersion: input.catalogVersion, recipeFormatVersion: input.recipeFormatVersion };
  });
});
afterEach(async () => {
  for (const entry of m.barriers.values()) entry.resolve();
  await Promise.allSettled(jobs);
  await vi.waitFor(() => expect(isPrefetchRunning()).toBe(false));
  expect(isSyncRunning()).toBe(false);
});

 describe("inicio rápido con motor y caché reales", () => {
  it("libera el sync tras textos aun con miniatura detenida y mantiene portadas detrás de miniaturas", async () => {
    const thumb = barrier("/thumb.webp"); const cover = barrier("/cover.webp");
    const progress = vi.fn(); const completed = vi.fn();
    const job = start({ onProgress: progress, onImagesFinished: completed });
    expect(await job).toMatchObject({ success: true, wasInitial: true, missingImages: 0 });
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/thumb.webp"));
    expect(m.applied).toBe(true); expect(m.count).toBe(1);
    expect(m.downloads).not.toContain("https://server.test/cover.webp");
    expect(isSyncRunning()).toBe(false);
    expect(await countMissingImages(["/thumb.webp"])).toBe(1);
    const reportsAtEntry = progress.mock.calls.length;
    thumb.resolve();
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/cover.webp"));
    expect(isPrefetchRunning()).toBe(true); expect(completed).not.toHaveBeenCalled();
    expect(await countMissingImages(["/thumb.webp", "/collection.webp", "/category.webp"])).toBe(0);
    expect(await countMissingImages(["/cover.webp"])).toBe(1);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "done" });
    expect(progress.mock.calls.at(-1)?.[0].message).toContain("imágenes");
    cover.resolve();
    await vi.waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(await countMissingImages(["/cover.webp"])).toBe(0);
    expect(progress).toHaveBeenCalledTimes(reportsAtEntry); // No vuelve a bloquear la UI.
  });

  it("termina sin imágenes ni trabajos pendientes cuando el catálogo sólo tiene texto", async () => {
    m.pull.mockResolvedValue({ authorized: true, data: { ...data([]), collections: [], categories: [] } });
    expect(await start()).toMatchObject({ success: true, wasInitial: true, missingImages: 0 });
    expect(m.downloads).toEqual([]); expect(isPrefetchRunning()).toBe(false);
  });

  it("sin miniatura descarga la portada como respaldo sin bloquear y no la duplica", async () => {
    m.pull.mockResolvedValue({ authorized: true, data: data([{ slug: "legacy", thumbUrl: "  ", imageUrl: "/legacy.webp" }]) });
    const full = barrier("/legacy.webp");
    const job = start();
    expect(await job).toMatchObject({ success: true });
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/legacy.webp"));
    expect(await countMissingImages(["/legacy.webp"])).toBe(1);
    full.resolve();
    expect(m.downloads.filter(url => url.endsWith("/legacy.webp"))).toHaveLength(1);
  });

  it("el fallo de las portadas no vuelve a bloquear el texto ni convierte el sync en error", async () => {
    const cover = barrier("/cover.webp"); const completed = vi.fn();
    expect(await start({ onImagesFinished: completed })).toMatchObject({ success: true, missingImages: 0 });
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/cover.webp"));
    m.online = false; cover.resolve();
    await vi.waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(m.count).toBe(1); expect(await countMissingImages(["/cover.webp"])).toBe(1);
    expect(m.track).toHaveBeenCalledWith("sync_images_incomplete", { failed: 1, total: 1 });
  });

  it("retoma sólo las faltantes después de reabrir, sin redescargar miniaturas guardadas", async () => {
    const cover = barrier("/cover.webp");
    expect((await start()).success).toBe(true);
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/cover.webp"));
    m.online = false; cover.resolve();
    await vi.waitFor(() => expect(isPrefetchRunning()).toBe(false));
    __resetImageCacheIndex(); m.online = true; m.barriers.clear(); m.downloads.length = 0;
    const plan = catalogImagePlan(data());
    expect(await countMissingImages(plan.all)).toBe(1);
    jobs.push(prefetchInBackground(plan.all, { priority: plan.essential, concurrency: 2 }));
    await jobs.at(-1);
    expect(m.downloads).toEqual(["https://server.test/cover.webp"]);
    expect(await countMissingImages(plan.all)).toBe(0);
  });

  it("no baja dos veces una portada al abrir una ficha mientras está en la cola", async () => {
    const cover = barrier("/cover.webp");
    await start();
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/cover.webp"));
    const visible = getCachedImage("/cover.webp"); jobs.push(visible);
    cover.resolve();
    expect(await visible).toMatch(/^file:\/\//);
    expect(m.downloads.filter(url => url.endsWith("/cover.webp"))).toHaveLength(1);
  });

  it("con catálogo previo conserva la sincronización incremental y su recuento de fotos", async () => {
    m.count = 5; m.state.lastSyncAt = "2026-10-30T16:00:00.000Z";
    const cover = barrier("/cover.webp"); let settled = false;
    const job = start().then(result => { settled = true; return result; });
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/cover.webp"));
    expect(m.pull.mock.calls[0][0]).toMatchObject({ since: "2026-10-30T16:00:00.000Z", recipeFormatVersion: 2 });
    expect(settled).toBe(false); cover.resolve();
    expect(await job).toMatchObject({ wasInitial: false, success: true, missingImages: 0 });
  });

  it("un fallo de guardado no inicia descargas ni habilita contenido incompleto", async () => {
    m.apply.mockRejectedValue(new Error("transaction rolled back"));
    expect(await start()).toMatchObject({ success: false });
    expect(m.count).toBe(0); expect(m.downloads).toEqual([]);
  });

  it("espera el guardado completo y comunica su progreso real antes de iniciar imágenes", async () => {
    let commit!: () => void;
    const committed = new Promise<void>(resolve => { commit = resolve; });
    m.apply.mockImplementation(async (_input, options) => {
      options.onProgress({ completed: 0, total: 20 });
      options.onProgress({ completed: 10, total: 20 });
      await committed;
      m.applied = true; m.count = 1;
      options.onProgress({ completed: 20, total: 20 });
    });
    const progress = vi.fn(); let settled = false;
    const job = start({ onProgress: progress }).then(result => { settled = true; return result; });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: "saving", ratio: 0.5 })));
    expect(settled).toBe(false); expect(m.applied).toBe(false); expect(m.downloads).toEqual([]);
    commit();
    expect(await job).toMatchObject({ success: true });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: "saving", ratio: 1 }));
  });

  it("miniaturas fallidas no invalidan textos y permanecen pendientes para reanudar", async () => {
    const thumb = barrier("/thumb.webp"); const completed = vi.fn();
    expect(await start({ onImagesFinished: completed })).toMatchObject({ success: true });
    await vi.waitFor(() => expect(m.downloads).toContain("https://server.test/thumb.webp"));
    m.online = false; thumb.resolve();
    await vi.waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(m.count).toBe(1); expect(await countMissingImages(["/thumb.webp"])).toBe(1);
    expect(m.track).toHaveBeenCalledWith("sync_images_incomplete", expect.objectContaining({ failed: expect.any(Number) }));
  });

  it("sin conexión no borra ni modifica el catálogo ni inicia imágenes", async () => {
    m.online = false;
    expect(await start()).toMatchObject({ success: false, error: "Sin conexión a internet" });
    expect(m.pull).not.toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled(); expect(m.downloads).toEqual([]);
  });

  it("rechazo de dispositivo preserva el enforcement y no descarga contenido", async () => {
    m.pull.mockResolvedValue({ authorized: false, reason: "device-revoked", data: null });
    expect(await start()).toMatchObject({ success: false, unauthorized: true });
    expect(m.rejectAccess).toHaveBeenCalled(); expect(m.apply).not.toHaveBeenCalled(); expect(m.downloads).toEqual([]);
  });
});

describe("plan de imágenes esenciales", () => {
  it("normaliza y deduplica miniatura/portada con URL relativa y absoluta", () => {
    const plan = catalogImagePlan({ recipes: [
      { thumbUrl: " /same.webp ", imageUrl: "https://server.test/same.webp" },
      { thumbUrl: null, imageUrl: null }, { thumbUrl: "", imageUrl: "/legacy.webp" },
    ], collections: [{ imageUrl: " /same.webp " }], categories: [] });
    expect(plan.essential).toEqual(["https://server.test/same.webp", "https://server.test/legacy.webp"]);
    expect(plan.deferred).toEqual([]);
  });

  it("excluye las secundarias aunque existan hasta ocho imágenes de galería", () => {
    const recipe = { thumbUrl: "/thumb.webp", imageUrl: "/cover.webp", photos: Array.from({ length: 8 }, (_, i) => ({ imageUrl: `/gallery-${i}.webp` })) };
    const plan = catalogImagePlan({ recipes: [recipe], collections: [], categories: [] });
    expect(plan.all).toEqual(["https://server.test/thumb.webp", "https://server.test/cover.webp"]);
  });
});
