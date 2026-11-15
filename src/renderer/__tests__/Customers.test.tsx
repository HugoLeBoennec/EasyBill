// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Customers from '../Customers';

const customer = {
  id: 7,
  party_type: 'customer',
  legal_name: 'Acme SARL',
  siret: '73282932000074',
  siren: '732829320',
  city: 'Lyon',
  country_code: 'FR',
  active: 1,
  created_at: '2026-01-01 10:00:00',
  updated_at: '2026-01-01 10:00:00',
};

describe('Customers screen', () => {
  const party = {
    getCustomers: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    party.getCustomers.mockResolvedValue({ success: true, data: [customer] });
    party.update.mockResolvedValue({ success: true, data: true });
    party.create.mockResolvedValue({ success: true, data: 8 });
    (window as unknown as { electron: unknown }).electron = { party };
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('edits a customer without sending read-only columns (id, timestamps)', async () => {
    render(<Customers />);
    fireEvent.click(await screen.findByText('Modifier'));

    fireEvent.change(screen.getByDisplayValue('Lyon'), {
      target: { name: 'city', value: 'Villeurbanne' },
    });
    fireEvent.click(screen.getByText('Mettre à jour'));

    await waitFor(() => expect(party.update).toHaveBeenCalledTimes(1));
    const [id, updates] = party.update.mock.calls[0];
    expect(id).toBe(7);
    expect(updates).toMatchObject({ legal_name: 'Acme SARL', city: 'Villeurbanne' });
    expect(updates).not.toHaveProperty('id');
    expect(updates).not.toHaveProperty('created_at');
    expect(updates).not.toHaveProperty('updated_at');
  });

  it('shows the error returned by the backend and keeps the form open', async () => {
    party.update.mockResolvedValue({ success: false, error: 'Échec' });
    render(<Customers />);
    fireEvent.click(await screen.findByText('Modifier'));
    fireEvent.click(screen.getByText('Mettre à jour'));

    expect(await screen.findByText('Échec')).toBeTruthy();
    expect(screen.getByText('Modifier le client')).toBeTruthy();
  });
});
