import type Database from 'better-sqlite3';
import { createTestDb } from './test-db';
import { PartyRepository } from '../repositories/party-repository';
import type { NewRecord, Party } from '../types';

function customer(overrides: Partial<NewRecord<Party>> = {}): NewRecord<Party> {
  return {
    party_type: 'customer',
    legal_name: 'Dupont SARL',
    country_code: 'FR',
    active: 1,
    ...overrides,
  };
}

describe('PartyRepository', () => {
  let db: Database.Database;
  let repo: PartyRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new PartyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create / find', () => {
    it('creates a party with only the required fields', () => {
      const id = repo.create(customer());
      const party = repo.findById(id);

      expect(party).toMatchObject({
        id,
        party_type: 'customer',
        legal_name: 'Dupont SARL',
        country_code: 'FR',
        active: 1,
        siret: null,
        email: null,
      });
      expect(party?.created_at).toBeTruthy();
    });

    it('stores every optional field', () => {
      const id = repo.create(
        customer({
          trading_name: 'Dupont',
          legal_form: 'SARL',
          siren: '732829320',
          siret: '73282932000074',
          vat_number: 'FR44732829320',
          address_line1: '1 rue de la Paix',
          postal_code: '75002',
          city: 'Paris',
          contact_name: 'Jean Dupont',
          phone: '0102030405',
          email: 'contact@dupont.example',
          electronic_address: 'contact@dupont.example',
          electronic_address_scheme: 'EM',
        })
      );

      expect(repo.findById(id)).toMatchObject({
        siret: '73282932000074',
        vat_number: 'FR44732829320',
        city: 'Paris',
        electronic_address_scheme: 'EM',
      });
    });

    it('returns undefined for an unknown id', () => {
      expect(repo.findById(9999)).toBeUndefined();
    });

    it('finds a party by SIRET', () => {
      const id = repo.create(customer({ siret: '73282932000074' }));
      expect(repo.findBySiret('73282932000074')?.id).toBe(id);
      expect(repo.findBySiret('00000000000000')).toBeUndefined();
    });

    it('rejects an unknown party type (CHECK constraint)', () => {
      expect(() =>
        repo.create(customer({ party_type: 'prospect' as Party['party_type'] }))
      ).toThrow(/CHECK/i);
    });

    it('finds the company party', () => {
      const company = repo.findCompany();
      expect(company).toMatchObject({ id: 1, party_type: 'company' });
    });
  });

  describe('findAll / findCustomers / count', () => {
    beforeEach(() => {
      repo.create(customer({ legal_name: 'Zeta SAS', siret: '11111111100011' }));
      repo.create(customer({ legal_name: 'Alpha SARL', vat_number: 'FR00123456789' }));
      repo.create(customer({ legal_name: 'Inactive SA', active: 0 }));
      repo.create(customer({ legal_name: 'Fournisseur', party_type: 'supplier' }));
    });

    it('returns all parties ordered by legal name', () => {
      const names = repo.findAll().map((p) => p.legal_name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      expect(names).toHaveLength(5); // 4 + seeded company
    });

    it('filters by type and active flag', () => {
      expect(repo.findAll({ party_type: 'supplier' })).toHaveLength(1);
      expect(repo.findAll({ party_type: 'customer', active: true })).toHaveLength(2);
      expect(repo.findAll({ party_type: 'customer', active: false })).toHaveLength(1);
    });

    it('searches on name, SIRET and VAT number', () => {
      expect(repo.findAll({ search: 'alph' }).map((p) => p.legal_name)).toEqual(['Alpha SARL']);
      expect(repo.findAll({ search: '111111111' }).map((p) => p.legal_name)).toEqual(['Zeta SAS']);
      expect(repo.findAll({ search: 'FR0012' }).map((p) => p.legal_name)).toEqual(['Alpha SARL']);
    });

    it('paginates with limit and offset', () => {
      const all = repo.findAll();
      expect(repo.findAll({ limit: 2 })).toEqual(all.slice(0, 2));
      expect(repo.findAll({ limit: 2, offset: 2 })).toEqual(all.slice(2, 4));
    });

    it('lists customers, active only by default', () => {
      expect(repo.findCustomers().map((p) => p.legal_name)).toEqual(['Alpha SARL', 'Zeta SAS']);
      expect(repo.findCustomers(false)).toHaveLength(3);
    });

    it('counts with filters', () => {
      expect(repo.count()).toBe(5);
      expect(repo.count({ party_type: 'customer' })).toBe(3);
      expect(repo.count({ party_type: 'customer', active: true })).toBe(2);
    });
  });

  describe('update / deactivate / delete', () => {
    it('updates the given fields only', () => {
      const id = repo.create(customer({ city: 'Paris' }));

      expect(repo.update(id, { legal_name: 'Durand SAS', email: 'a@b.example' })).toBe(true);
      expect(repo.findById(id)).toMatchObject({
        legal_name: 'Durand SAS',
        email: 'a@b.example',
        city: 'Paris',
      });
    });

    it('clears a field passed as undefined', () => {
      const id = repo.create(customer({ phone: '0102030405' }));
      expect(repo.update(id, { phone: undefined })).toBe(true);
      expect(repo.findById(id)?.phone).toBeNull();
    });

    it('returns false when there is nothing to update or no such party', () => {
      const id = repo.create(customer());
      expect(repo.update(id, {})).toBe(false);
      expect(repo.update(9999, { legal_name: 'X' })).toBe(false);
    });

    it('refuses column names that are not plain identifiers or are read-only', () => {
      const id = repo.create(customer());
      const injected = { 'legal_name = (SELECT 1) --': 'x' } as Record<string, string>;

      expect(() => repo.update(id, injected)).toThrow(/column/i);
      expect(() => repo.update(id, { id: 42 } as Record<string, number>)).toThrow(/column/i);
      expect(repo.findById(id)?.legal_name).toBe('Dupont SARL');
    });

    it('deactivates a party', () => {
      const id = repo.create(customer());
      expect(repo.deactivate(id)).toBe(true);
      expect(repo.findById(id)?.active).toBe(0);
      expect(repo.deactivate(9999)).toBe(false);
    });

    it('deletes a party', () => {
      const id = repo.create(customer());
      expect(repo.delete(id)).toBe(true);
      expect(repo.findById(id)).toBeUndefined();
      expect(repo.delete(id)).toBe(false);
    });

    it('refuses to delete a party referenced by an invoice (foreign key)', () => {
      const id = repo.create(customer());
      db.prepare(
        `INSERT INTO invoices (invoice_number, invoice_date, subtotal_amount, tax_amount, total_amount, buyer_id)
         VALUES ('X-1', '2026-01-01', 100, 20, 120, ?)`
      ).run(id);

      expect(() => repo.delete(id)).toThrow(/FOREIGN KEY/i);
    });
  });

  describe('existsBySiret', () => {
    it('detects duplicates, optionally ignoring one party', () => {
      const id = repo.create(customer({ siret: '73282932000074' }));

      expect(repo.existsBySiret('73282932000074')).toBe(true);
      expect(repo.existsBySiret('73282932000074', id)).toBe(false);
      expect(repo.existsBySiret('00000000000000')).toBe(false);
    });
  });
});
