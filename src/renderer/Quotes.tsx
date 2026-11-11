/**
 * Quotes Component
 *
 * List and manage quotes (devis): filter, change status, delete,
 * and convert to invoice.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { QuoteComplete, QuoteStatus } from '../database/types';

type StatusFilter = 'all' | QuoteStatus;

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
  converted: 'Facturé',
};

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-gray-200 text-gray-800',
  sent: 'bg-purple-200 text-purple-800',
  accepted: 'bg-green-200 text-green-800',
  rejected: 'bg-red-200 text-red-800',
  expired: 'bg-orange-200 text-orange-800',
  converted: 'bg-blue-200 text-blue-800',
};

const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
];

/** Statuses the user may move a quote to, from its current status */
const NEXT_STATUSES: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected', 'expired', 'draft'],
  accepted: ['sent', 'rejected'],
  rejected: ['draft', 'sent'],
  expired: ['draft', 'sent'],
  converted: [],
};

const STATUS_ACTION_LABELS: Record<QuoteStatus, string> = {
  draft: 'Repasser en brouillon',
  sent: 'Marquer comme envoyé',
  accepted: 'Marquer comme accepté',
  rejected: 'Marquer comme refusé',
  expired: 'Marquer comme expiré',
  converted: '',
};

const amountFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const formatAmount = (cents: number): string =>
  amountFormatter.format((cents || 0) / 100);

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  // Dates are stored as YYYY-MM-DD: build a local date to avoid UTC shifts
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR');
};

const todayISO = (): string => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
};

/** A quote still awaiting an answer whose validity date is in the past */
const isOverdue = (quote: QuoteComplete): boolean =>
  !!quote.valid_until &&
  (quote.status === 'draft' || quote.status === 'sent') &&
  quote.valid_until < todayISO();

type PendingAction =
  | { type: 'delete'; quote: QuoteComplete }
  | { type: 'convert'; quote: QuoteComplete };

const Quotes = () => {
  const [quotes, setQuotes] = useState<QuoteComplete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInvoicesLink, setShowInvoicesLink] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounce the search box so we do not query on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await window.electron.quote.list({
        ...(filter !== 'all' ? { status: filter } : {}),
        ...(search ? { search } : {}),
      });

      if (response.success && response.data) {
        setQuotes(response.data.quotes);
      } else {
        setError(response.error || 'Impossible de charger les devis');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  const handleStatusChange = async (quote: QuoteComplete, status: QuoteStatus) => {
    setError(null);
    setSuccess(null);
    setShowInvoicesLink(false);
    try {
      const response = await window.electron.quote.setStatus(quote.id!, status);
      if (response.success) {
        setSuccess(
          `Devis ${quote.quote_number} : statut « ${QUOTE_STATUS_LABELS[status]} »`
        );
        await loadQuotes();
      } else {
        setError(response.error || 'Impossible de changer le statut');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { quote } = pending;

    setBusy(true);
    setError(null);
    setSuccess(null);
    setShowInvoicesLink(false);

    try {
      if (pending.type === 'delete') {
        const response = await window.electron.quote.delete(quote.id!);
        if (response.success) {
          setSuccess(`Devis ${quote.quote_number} supprimé`);
        } else {
          setError(response.error || 'Impossible de supprimer le devis');
        }
      } else {
        const response = await window.electron.quote.convertToInvoice(quote.id!);
        if (response.success && response.data) {
          setShowInvoicesLink(true);
          setSuccess(
            `Devis ${quote.quote_number} converti : facture ${response.data.invoice_number} créée en brouillon`
          );
        } else {
          setError(response.error || 'Impossible de convertir le devis');
        }
      }
      await loadQuotes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const getStatusBadge = (status: QuoteStatus) => (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full ${
        STATUS_STYLES[status] || 'bg-gray-200 text-gray-800'
      }`}
    >
      {QUOTE_STATUS_LABELS[status] || status}
    </span>
  );

  const openQuotes = quotes.filter(
    (q) => q.status === 'draft' || q.status === 'sent'
  );
  const wonQuotes = quotes.filter(
    (q) => q.status === 'accepted' || q.status === 'converted'
  );
  const hasCriteria = filter !== 'all' || search !== '';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Devis</h1>
          <p className="text-gray-600 mt-1">
            Créez vos devis, suivez leur statut et convertissez-les en factures
          </p>
        </div>
        <Link
          to="/quotes/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nouveau devis
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {status === 'all' ? 'Tous' : QUOTE_STATUS_LABELS[status]}
          </button>
        ))}
        <input
          type="search"
          aria-label="Rechercher un devis"
          className="ml-auto w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Rechercher (numéro, client, notes)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
        >
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="bg-green-100 border border-green-400 text-green-800 px-4 py-3 rounded mb-4 flex justify-between items-center"
        >
          <span>{success}</span>
          {showInvoicesLink && (
            <Link to="/invoices" className="text-sm underline hover:no-underline">
              Voir les factures
            </Link>
          )}
        </div>
      )}

      {/* Quotes Table */}
      {loading && quotes.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Chargement...</div>
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-600 text-lg">
            {hasCriteria
              ? 'Aucun devis ne correspond à ces critères'
              : 'Aucun devis pour le moment'}
          </p>
          {!hasCriteria && (
            <Link
              to="/quotes/new"
              className="text-blue-600 hover:underline mt-2 inline-block"
            >
              Créer votre premier devis
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Numéro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valable jusqu'au
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total TTC
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotes.map((quote) => {
                const converted = quote.status === 'converted';
                const canConvert = !converted && quote.status !== 'rejected';
                const nextStatuses = NEXT_STATUSES[quote.status] || [];

                return (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/quotes/${quote.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {quote.quote_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {quote.customer_name || 'N/A'}
                      </div>
                      {quote.customer_siret && (
                        <div className="text-sm text-gray-500">
                          SIRET: {quote.customer_siret}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(quote.quote_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="text-gray-900">
                        {formatDate(quote.valid_until)}
                      </div>
                      {isOverdue(quote) && (
                        <div className="text-xs text-orange-600">
                          Validité dépassée
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {formatAmount(quote.total_amount)}
                      </div>
                      <div className="text-sm text-gray-500">
                        HT: {formatAmount(quote.subtotal_amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(quote.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-3">
                        {nextStatuses.length > 0 && (
                          <select
                            aria-label={`Changer le statut du devis ${quote.quote_number}`}
                            className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleStatusChange(
                                  quote,
                                  e.target.value as QuoteStatus
                                );
                              }
                            }}
                          >
                            <option value="">Statut…</option>
                            {nextStatuses.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_ACTION_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        )}
                        {canConvert && (
                          <button
                            type="button"
                            onClick={() => setPending({ type: 'convert', quote })}
                            className="text-green-700 hover:text-green-900"
                          >
                            Convertir en facture
                          </button>
                        )}
                        <Link
                          to={`/quotes/${quote.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {converted ? 'Voir' : 'Modifier'}
                        </Link>
                        {!converted && (
                          <button
                            type="button"
                            onClick={() => setPending({ type: 'delete', quote })}
                            className="text-red-600 hover:text-red-900"
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total devis</div>
          <div className="text-2xl font-bold text-gray-900">{quotes.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Montant total TTC</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatAmount(quotes.reduce((sum, q) => sum + q.total_amount, 0))}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">En attente de réponse</div>
          <div className="text-2xl font-bold text-orange-600">
            {formatAmount(openQuotes.reduce((sum, q) => sum + q.total_amount, 0))}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Acceptés / facturés</div>
          <div className="text-2xl font-bold text-green-600">
            {formatAmount(wonQuotes.reduce((sum, q) => sum + q.total_amount, 0))}
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      {pending && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-confirm-title"
            className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md"
          >
            <h2
              id="quote-confirm-title"
              className="text-xl font-semibold text-gray-900 mb-2"
            >
              {pending.type === 'delete'
                ? 'Supprimer le devis ?'
                : 'Convertir en facture ?'}
            </h2>
            <p className="text-gray-600 mb-6">
              {pending.type === 'delete'
                ? `Le devis ${pending.quote.quote_number} et ses lignes seront définitivement supprimés.`
                : `Une facture en brouillon de ${formatAmount(
                    pending.quote.total_amount
                  )} sera créée à partir du devis ${
                    pending.quote.quote_number
                  }. Le devis ne pourra plus être modifié.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmPending}
                disabled={busy}
                className={`px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                  pending.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {busy
                  ? 'Veuillez patienter...'
                  : pending.type === 'delete'
                    ? 'Supprimer'
                    : 'Convertir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quotes;
