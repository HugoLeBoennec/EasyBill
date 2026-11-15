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
});
