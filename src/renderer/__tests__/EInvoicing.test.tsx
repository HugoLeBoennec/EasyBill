// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EInvoicing from '../EInvoicing';
import { DEFAULT_PUBLIC_SETTINGS } from '../../services/einvoicing/storage';

describe('E-invoicing settings screen', () => {
  const credentials = {
    get: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
    importLegacy: vi.fn(),
  };
  const stored = { ...DEFAULT_PUBLIC_SETTINGS, enabled: true, apiEndpoint: '' };

  const renderPage = () =>
    render(
      <MemoryRouter>
        <EInvoicing />
      </MemoryRouter>
    );

  beforeEach(() => {
    window.localStorage.clear();
    // Element.scrollIntoView does not exist in jsdom
    Element.prototype.scrollIntoView = vi.fn();
    credentials.get.mockResolvedValue(stored);
    credentials.save.mockImplementation(async (input) => ({
      ok: true,
      settings: { ...stored, ...input, hasClientId: true, hasClientSecret: true },
    }));
    (window as unknown as { electron: unknown }).electron = { credentials };
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('starts from the platform default endpoint when nothing is stored yet', async () => {
    renderPage();
    const endpoint = (await screen.findByPlaceholderText('https://api.example.com')) as HTMLInputElement;
    await waitFor(() => expect(endpoint.value).toBe('https://api-qualif.piste.gouv.fr/cpro/v1'));
  });

  it('saves with the default endpoint (no "address required" error) and confirms', async () => {
    renderPage();
    const endpoint = (await screen.findByPlaceholderText('https://api.example.com')) as HTMLInputElement;
    await waitFor(() => expect(endpoint.value).not.toBe(''));
    fireEvent.change(screen.getByPlaceholderText('your-client-id'), { target: { value: 'id' } });
    fireEvent.change(document.getElementById('client-secret') as HTMLElement, { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Sauvegarder'));

    await waitFor(() => expect(credentials.save).toHaveBeenCalledTimes(1));
    expect(credentials.save.mock.calls[0][0]).toMatchObject({
      apiEndpoint: 'https://api-qualif.piste.gouv.fr/cpro/v1',
      clientId: 'id',
    });
    expect(await screen.findByText('Paramètres sauvegardés')).toBeTruthy();
  });

  it('does not pretend that the connection test succeeded', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Tester la connexion'));
    expect(screen.queryByText('Connexion réussie !')).toBeNull();
    expect(screen.getByText(/pas encore disponible/)).toBeTruthy();
  });

  it('links back to the settings page', async () => {
    renderPage();
    expect((await screen.findByText('← Paramètres')).getAttribute('href')).toBe('/setting');
  });
});
