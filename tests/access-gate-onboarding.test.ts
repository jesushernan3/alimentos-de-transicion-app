import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ state: 'signed-in', ready: true, hasContent: true, hydrated: true, seen: false, path: '/', replace: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => ({replace: m.replace}), usePathname: () => m.path }));
vi.mock('@/lib/access-context', () => ({ useAccess: () => ({state: m.state}) }));
vi.mock('@/lib/catalog-context', () => ({ useCatalog: () => ({ready: m.ready, hasContent: m.hasContent}) }));
vi.mock('@/lib/user-data-context', () => ({ useUserData: () => ({hydrated: m.hydrated, onboardingSeen: m.seen}) }));
import { AccessGate } from '../components/access-gate';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function run() { let view!: ReactTestRenderer; await act(async () => { view = create(React.createElement(AccessGate)); }); await act(async () => view.unmount()); }
beforeEach(() => { m.state = 'signed-in'; m.ready = true; m.hasContent = true; m.hydrated = true; m.seen = false; m.path = '/'; m.replace.mockReset(); });
describe('onboarding automático con acceso válido', () => {
  it('primera apertura muestra introducción antes del contenido', async () => { await run(); expect(m.replace).toHaveBeenCalledWith('/onboarding'); });
  it('no decide usando preferencias antes de hidratarlas', async () => { m.hydrated = false; await run(); expect(m.replace).not.toHaveBeenCalled(); });
  it('se muestra sin catálogo listo porque las imágenes son assets locales', async () => { m.ready = false; m.hasContent = false; await run(); expect(m.replace).toHaveBeenCalledWith('/onboarding'); });
  it('no repite introducción ya completada', async () => { m.seen = true; await run(); expect(m.replace).not.toHaveBeenCalled(); });
  it('onboarding visible no se redirige a descarga antes de terminarlo', async () => { m.path = '/onboarding'; m.hasContent = false; await run(); expect(m.replace).not.toHaveBeenCalled(); });
  it('reproducción manual sigue disponible con seen true', async () => { m.path = '/onboarding'; m.seen = true; m.hasContent = false; await run(); expect(m.replace).not.toHaveBeenCalled(); });
  it('tras completar introducción corresponde descargar si no hay catálogo', async () => { m.path = '/acceso'; m.seen = true; m.hasContent = false; await run(); expect(m.replace).toHaveBeenCalledWith('/descarga-inicial'); });
  it('usuario recurrente vuelve a Home desde acceso con catálogo disponible', async () => { m.path = '/acceso'; m.seen = true; await run(); expect(m.replace).toHaveBeenCalledWith('/(tabs)'); });
  for (const state of ['device-revoked', 'signed-out', 'revoked']) {
    it(`${state} nunca muestra onboarding ni contenido protegido`, async () => { m.state = state; m.path = '/onboarding'; await run(); expect(m.replace).toHaveBeenCalledWith('/acceso'); });
  }
  it('durante carga de sesión no navega', async () => { m.state = 'loading'; await run(); expect(m.replace).not.toHaveBeenCalled(); });
  it('soporte público no se interrumpe por onboarding', async () => { m.path = '/soporte'; await run(); expect(m.replace).not.toHaveBeenCalled(); });
});
