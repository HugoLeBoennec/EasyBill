import type Database from 'better-sqlite3';
import { createTestDb, insertCustomer, isoDate } from './test-db';
import { QuoteRepository } from '../repositories/quote-repository';
import type { QuoteStatus } from '../types';

describe('quote expiry', () => {
  let db: Database.Database;
  let repo: QuoteRepository;
  let customerId: number;

  const create = (validUntil: string | undefined, status: QuoteStatus = 'draft') => {
    const id = repo.createWithLines(
      { quote_date: '2026-01-01', valid_until: validUntil, customer_id: customerId },
      [{ item_name: 'Audit', quantity: 1, unit_price: 10000, vat_rate: 20 }]
    );
    if (status !== 'draft') {
      db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, id);
    }
    return id;
  };
  const statusOf = (id: number) => repo.findById(id)!.status;

  beforeEach(() => {
    db = createTestDb();
    repo = new QuoteRepository(db);
    customerId = insertCustomer(db);
  });
  afterEach(() => db.close());

  it('expires draft and sent quotes whose validity date has passed, in one pass', () => {
    const draft = create(isoDate(-1));
    const sent = create(isoDate(-30), 'sent');
    expect(repo.expireOverdue()).toBe(2);
    expect(statusOf(draft)).toBe('expired');
    expect(statusOf(sent)).toBe('expired');
    expect(repo.expireOverdue()).toBe(0);
  });

  it('keeps quotes valid today or later, and quotes without a date', () => {
    const today = create(isoDate(0));
    const future = create(isoDate(10), 'sent');
    const none = create(undefined);
    expect(repo.expireOverdue()).toBe(0);
    expect(statusOf(today)).toBe('draft');
    expect(statusOf(future)).toBe('sent');
    expect(statusOf(none)).toBe('draft');
  });

  it('never touches accepted, rejected or converted quotes', () => {
    const ids = (['accepted', 'rejected', 'converted'] as QuoteStatus[]).map((s) => create(isoDate(-5), s));
    expect(repo.expireOverdue()).toBe(0);
    expect(ids.map(statusOf)).toEqual(['accepted', 'rejected', 'converted']);
  });

  it('runs at list time: lists, counts and the status filter see the expired quote', () => {
    const id = create(isoDate(-1), 'sent');
    create(isoDate(5));
    expect(repo.count({ status: 'expired' })).toBe(1);
    expect(repo.getAllComplete({ status: 'sent' })).toHaveLength(0);
    expect(repo.getAllComplete({ status: 'expired' }).map((q) => q.id)).toEqual([id]);
    expect(repo.getComplete(id)!.status).toBe('expired');
  });

  it('accepts an explicit reference date', () => {
    const id = create('2026-06-30');
    expect(repo.expireOverdue('2026-06-30')).toBe(0);
    expect(repo.expireOverdue('2026-07-01')).toBe(1);
    expect(statusOf(id)).toBe('expired');
  });

  describe('reviving an expired quote', () => {
    const lines = [{ item_name: 'Audit', quantity: 1, unit_price: 10000, vat_rate: 20 }];
    const input = (validUntil: string) => ({
      quote_date: '2026-01-01',
      valid_until: validUntil,
      customer_id: customerId,
    });

    it('returns to draft when the validity date is extended to today or later', () => {
      for (const date of [isoDate(0), isoDate(30)]) {
        const id = create(isoDate(-3), 'sent');
        db.prepare("UPDATE quotes SET sent_at = '2026-01-02' WHERE id = ?").run(id);
        repo.expireOverdue();
        expect(statusOf(id)).toBe('expired');

        repo.updateWithLines(id, input(date), lines);
        expect(statusOf(id)).toBe('draft');
        expect(repo.expireOverdue()).toBe(0);
        expect(statusOf(id)).toBe('draft');
        expect(repo.findById(id)!.sent_at).toBeNull();
      }
    });

    it('also works through a plain update() of valid_until', () => {
      const id = create(isoDate(-3));
      repo.expireOverdue();
      repo.update(id, { valid_until: isoDate(10) });
      expect(statusOf(id)).toBe('draft');
    });

    it('stays expired when the new date is still in the past', () => {
      const id = create(isoDate(-10));
      repo.expireOverdue();
      repo.updateWithLines(id, input(isoDate(-1)), lines);
      expect(statusOf(id)).toBe('expired');
    });

    it('does not touch the status of quotes that are not expired', () => {
      const accepted = create(isoDate(5), 'accepted');
      repo.update(accepted, { valid_until: isoDate(40) });
      expect(statusOf(accepted)).toBe('accepted');
    });

    it('refuses to move an overdue expired quote back to draft or sent without a new date', () => {
      const id = create(isoDate(-3));
      repo.expireOverdue();
      expect(() => repo.setStatus(id, 'draft')).toThrow(/prolongez/);
      expect(() => repo.setStatus(id, 'sent')).toThrow(/prolongez/);
      expect(statusOf(id)).toBe('expired');
      // once the date is extended it is already a draft again, and may be sent
      repo.update(id, { valid_until: isoDate(7) });
      expect(repo.setStatus(id, 'sent')).toBe(true);
      expect(statusOf(id)).toBe('sent');
    });

    it('lets a manually expired quote (date still valid) go back to draft', () => {
      const id = create(isoDate(7), 'sent');
      repo.setStatus(id, 'expired');
      expect(repo.setStatus(id, 'draft')).toBe(true);
      expect(statusOf(id)).toBe('draft');
    });
  });
});
