import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessCodes } from '../drizzle/schema';
const m = vi.hoisted(() => ({ records: [] as any[], recent: [] as any[], source: null as any, send: vi.fn(), update: vi.fn() }));
vi.mock('../server/db', () => ({ getDb: async () => ({
  select: () => {
    const q: any = { from: (table: unknown) => { m.source = table; return q; }, where: () => q, orderBy: () => q,
      limit: () => Promise.resolve(m.source === accessCodes ? m.recent : m.records),
      then: (resolve: any) => Promise.resolve(m.source === accessCodes ? m.recent : m.records).then(resolve) };
    return q;
  },
  insert: () => ({ values: async () => ({ insertId: 1 }) }),
  update: () => ({ set: (data: unknown) => { m.update(data); return { where: async () => undefined }; } }),
}) }));
vi.mock('../server/mailer', () => ({ deliverAccessCodeWithOutcome: m.send }));
vi.mock('../server/review-access', () => ({ isReviewEmail: () => false, matchesReviewCode: () => false }));
import { requestAccessCode } from '../server/access';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z')); m.records = []; m.recent = []; m.send.mockReset(); m.update.mockReset();
});
afterEach(() => { vi.useRealTimers(); });
async function request() { const p = requestAccessCode('fixture@ejemplo.test'); await vi.runAllTimersAsync(); return p; }
describe('privacidad pública ante fallo del proveedor OTP', () => {
  for (const failure of ['sin proveedor', 'cuota', 'dominio', 'timeout', 'error interno']) {
    it(`${failure}: autorizado y sin licencia tienen exactamente la misma respuesta`, async () => {
      const absent = await request(); expect(m.send).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
      m.records = [{id: 1, email: 'fixture@ejemplo.test', status: 'active', expiresAt: null}];
      m.send.mockResolvedValue({ delivered: false, channel: 'manual', error: failure });
      const allowed = await request();
      expect(allowed).toEqual(absent); expect(allowed).toMatchObject({ sent: true, manualDelivery: false });
      expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ debugCode: expect.stringMatching(/^\d{6}$/), deliveredVia: 'manual' }));
      expect(m.send).toHaveBeenCalledOnce();
    });
  }
  it('éxito mantiene el mismo contrato sin guardar código en claro', async () => {
    const absent = await request(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    m.records = [{id: 1, status: 'active', expiresAt: null}]; m.send.mockResolvedValue({ delivered: true, channel: 'email' });
    expect(await request()).toEqual(absent); expect(m.update).not.toHaveBeenCalled();
  });
  it('excepción inesperada del mailer tampoco revela licencia ni se propaga al usuario', async () => {
    const absent = await request(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    m.records = [{id: 1, status: 'active', expiresAt: null}]; m.send.mockRejectedValue(new Error('error privado del proveedor'));
    expect(await request()).toEqual(absent);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ deliveredVia: 'manual' }));
  });
  it('cooldown no revela proveedor ausente ni resultado de la entrega anterior', async () => {
    m.recent = [{createdAt: new Date(), expiresAt: new Date(Date.now() + 600000)}];
    const absent = await request(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    m.records = [{id: 1, status: 'active', expiresAt: null}];
    expect(await request()).toEqual(absent); expect(absent).toMatchObject({ sent: false, manualDelivery: false, cooldownSeconds: 45 });
    expect(m.send).not.toHaveBeenCalled();
  });
});
