/**
 * Invoices Component
 *
 * List and manage invoices: export, edit (drafts), finalize, mark as sent /
 * paid, delete (drafts).
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { InvoiceComplete, InvoiceFilter, InvoiceStatus } from '../database/types';
import type { InvoiceExportFormat } from '../main/invoice-mapper';

type StatusFilter = 'all' | InvoiceStatus;

export interface Feedback {
  type: 'success' | 'error';
  message: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  finalized: 'Finalisée',
  sent: 'Envoyée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-800',
  finalized: 'bg-blue-200 text-blue-800',
  sent: 'bg-purple-200 text-purple-800',
  paid: 'bg-green-200 text-green-800',
  cancelled: 'bg-red-200 text-red-800',
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'finalized', label: 'Finalisées' },
  { value: 'sent', label: 'Envoyées' },
  { value: 'paid', label: 'Payées' },
];

const EXPORT_FORMATS: { format: InvoiceExportFormat; label: string; title: string }[] = [
  { format: 'facturx-pdf', label: 'PDF', title: 'PDF Factur-X (PDF lisible avec XML embarqué)' },
  { format: 'facturx-xml', label: 'Factur-X', title: 'XML Factur-X seul (format CII)' },
  { format: 'ubl', label: 'UBL', title: 'XML UBL 2.1' },
];

export const formatAmount = (cents: number): string =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  // Dates are stored as YYYY-MM-DD: format without going through a time zone
  const [year, month, day] = dateStr.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : dateStr;
};

/** Number shown to the user: a draft has no definitive number yet. */
export const displayInvoiceNumber = (invoice: { status: string; invoice_number: string }): string =>
  invoice.status === 'draft' ? 'Brouillon' : invoice.invoice_number;

export const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`px-2 py-1 text-xs font-semibold rounded-full ${
      STATUS_STYLES[status] || 'bg-gray-200 text-gray-800'
    }`}
  >
    {STATUS_LABELS[status] || status}
  </span>
);

/** Inline, dismissible success / error banner. */
export const FeedbackBanner = ({
  feedback,
  onClose,
}: {
  feedback: Feedback | null;
  onClose: () => void;
}) => {
  if (!feedback) return null;
  const styles =
    feedback.type === 'success'
      ? 'bg-green-50 border-green-400 text-green-800'
      : 'bg-red-50 border-red-400 text-red-800';
  return (
    <div
      role={feedback.type === 'error' ? 'alert' : 'status'}
      className={`flex justify-between items-start gap-4 border px-4 py-3 rounded mb-4 ${styles}`}
    >
      <span className="whitespace-pre-line break-words">{feedback.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="font-bold leading-none hover:opacity-70"
        aria-label="Fermer le message"
      >
        ×
      </button>
    </div>
  );
};

/** Export buttons (PDF / Factur-X / UBL) for one issued invoice. */
export const InvoiceExportButtons = ({
  invoiceId,
  onFeedback,
  variant = 'link',
}: {
  invoiceId: number;
  onFeedback: (feedback: Feedback | null) => void;
  variant?: 'link' | 'button';
}) => {
  const [exporting, setExporting] = useState<InvoiceExportFormat | null>(null);

  const handleExport = async (format: InvoiceExportFormat) => {
    setExporting(format);
    onFeedback(null);
    try {
      const response = await window.electron.invoice.export(invoiceId, format);
      if (!response.success) {
        onFeedback({ type: 'error', message: response.error || "Échec de l'export." });
      } else if (response.data && !response.data.canceled) {
        onFeedback({
          type: 'success',
          message: `Facture exportée : ${response.data.path}`,
        });
      }
    } catch (err: unknown) {
      onFeedback({
        type: 'error',
        message: `Échec de l'export : ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setExporting(null);
    }
  };

  const className =
    variant === 'button'
      ? 'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50'
      : 'px-2 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50';

  return (
    <span className="inline-flex gap-1 items-center">
      {EXPORT_FORMATS.map(({ format, label, title }) => (
        <button
          key={format}
          type="button"
          title={title}
          className={className}
          disabled={exporting !== null}
          onClick={() => handleExport(format)}
        >
          {exporting === format ? '…' : variant === 'button' ? `Exporter ${label}` : label}
        </button>
      ))}
    </span>
  );
};

type PendingConfirmation = { id: number; action: 'delete' | 'finalize' } | null;

const Invoices = () => {
  const [invoices, setInvoices] = useState<InvoiceComplete[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [confirmation, setConfirmation] = useState<PendingConfirmation>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      const filterObj: InvoiceFilter = filter === 'all' ? {} : { status: filter };
      const response = await window.electron.invoice.list(filterObj);

      if (response.success && response.data) {
        // Load complete invoice data (buyer name, e-invoicing status) for each
        const completeInvoices = await Promise.all(
          response.data.invoices.map(async (inv) => {
            const completeResp = await window.electron.invoice.getComplete(inv.id as number);
            return (completeResp.data || inv) as InvoiceComplete;
          })
        );
        setInvoices(completeInvoices);
      } else {
        setFeedback({
          type: 'error',
          message: response.error || 'Impossible de charger les factures.',
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Impossible de charger les factures.',
      });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  /** Run an action on one invoice, then refresh the list and report the outcome. */
  const runAction = async (
    id: number,
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string | (() => string),
    failureMessage: string
  ) => {
    setBusyId(id);
    setConfirmation(null);
    setFeedback(null);
    try {
      const response = await action();
      if (response.success) {
        setFeedback({
          type: 'success',
          message: typeof successMessage === 'function' ? successMessage() : successMessage,
        });
      } else {
        setFeedback({ type: 'error', message: response.error || failureMessage });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : failureMessage,
      });
    } finally {
      await loadInvoices();
      setBusyId(null);
    }
  };

  const handleDelete = (id: number) =>
    runAction(
      id,
      () => window.electron.invoice.delete(id),
      'Brouillon supprimé.',
      'La suppression a échoué.'
    );

  const handleFinalize = (id: number) => {
    let finalizedNumber: string | undefined;
    return runAction(
      id,
      async () => {
        const response = await window.electron.invoice.finalize(id);
        if (response.success) {
          const updated = await window.electron.invoice.get(id);
          finalizedNumber = updated.data?.invoice_number;
        }
        return response;
      },
      () =>
        finalizedNumber
          ? `Facture finalisée sous le numéro ${finalizedNumber}.`
          : 'Facture finalisée.',
      'La finalisation a échoué.'
    );
  };

  const handleMarkSent = (id: number) =>
    runAction(
      id,
      () => window.electron.invoice.markSent(id),
      'Facture marquée comme envoyée.',
      "Impossible de marquer la facture comme envoyée."
    );

  const handleMarkPaid = (id: number) =>
    runAction(
      id,
      () => window.electron.invoice.markPaid(id),
      'Facture marquée comme payée.',
      'Impossible de marquer la facture comme payée.'
    );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  const issued = invoices.filter((inv) => inv.status !== 'draft' && inv.status !== 'cancelled');
  const actionLink = 'hover:underline disabled:opacity-50 disabled:no-underline';

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Factures</h1>
          <p className="text-gray-600 mt-1">
            Gérez vos factures et leur conformité e-invoicing
          </p>
        </div>
        <Link
          to="/invoices/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nouvelle facture
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Success / error messages */}
      <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      {/* Invoice Table */}
      {invoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">Aucune facture trouvée</p>
          <Link
            to="/invoices/new"
            className="text-blue-600 hover:underline mt-2 inline-block"
          >
            {filter === 'all' ? 'Créer votre première facture' : 'Créer une facture'}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Numéro', 'Client', 'Date', 'Montant TTC', 'Statut', 'E-Invoicing'].map(
                  (title) => (
                    <th
                      key={title}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {title}
                    </th>
                  )
                )}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => {
                const id = invoice.id as number;
                const isDraft = invoice.status === 'draft';
                const busy = busyId === id;
                const confirming = confirmation?.id === id ? confirmation.action : null;

                return (
                  <tr key={id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Link
                        to={`/invoices/${id}`}
                        className={`hover:underline font-medium ${
                          isDraft ? 'text-gray-500 italic' : 'text-blue-600'
                        }`}
                      >
                        {displayInvoiceNumber(invoice)}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {invoice.buyer_name || 'N/A'}
                      </div>
                      {invoice.buyer_siret && (
                        <div className="text-sm text-gray-500">SIRET: {invoice.buyer_siret}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatAmount(invoice.total_amount)}
                      </div>
                      {!isDraft && (
                        <div className="text-sm text-gray-500">
                          Payé: {formatAmount(invoice.paid_amount || 0)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {invoice.einvoice_status ? (
                        <span className="text-xs text-gray-600">{invoice.einvoice_status}</span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-medium">
                      {confirming ? (
                        <div className="inline-flex flex-wrap justify-end items-center gap-3">
                          <span className="text-gray-700 font-normal">
                            {confirming === 'delete'
                              ? 'Supprimer définitivement ce brouillon ?'
                              : 'Finaliser ? Un numéro définitif sera attribué et la facture ne sera plus modifiable.'}
                          </span>
                          <button
                            type="button"
                            className={`${actionLink} ${
                              confirming === 'delete' ? 'text-red-600' : 'text-green-700'
                            }`}
                            onClick={() =>
                              confirming === 'delete' ? handleDelete(id) : handleFinalize(id)
                            }
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            className={`${actionLink} text-gray-600`}
                            onClick={() => setConfirmation(null)}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex flex-wrap justify-end items-center gap-3">
                          {isDraft ? (
                            <>
                              <Link
                                to={`/invoices/${id}`}
                                className="text-blue-600 hover:underline"
                              >
                                Modifier
                              </Link>
                              <button
                                type="button"
                                disabled={busy}
                                className={`${actionLink} text-green-700`}
                                onClick={() => setConfirmation({ id, action: 'finalize' })}
                              >
                                Finaliser
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className={`${actionLink} text-red-600`}
                                onClick={() => setConfirmation({ id, action: 'delete' })}
                              >
                                Supprimer
                              </button>
                            </>
                          ) : (
                            <>
                              <Link
                                to={`/invoices/${id}`}
                                className="text-blue-600 hover:underline"
                              >
                                Voir
                              </Link>
                              {invoice.status === 'finalized' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={`${actionLink} text-purple-700`}
                                  onClick={() => handleMarkSent(id)}
                                >
                                  Marquer envoyée
                                </button>
                              )}
                              {(invoice.status === 'finalized' || invoice.status === 'sent') && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={`${actionLink} text-green-700`}
                                  onClick={() => handleMarkPaid(id)}
                                >
                                  Marquer payée
                                </button>
                              )}
                              {invoice.status !== 'cancelled' && (
                                <InvoiceExportButtons invoiceId={id} onFeedback={setFeedback} />
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats (drafts are not issued invoices: they are excluded from amounts) */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total factures</div>
          <div className="text-2xl font-bold text-gray-900">{invoices.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Montant facturé TTC</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatAmount(issued.reduce((sum, inv) => sum + inv.total_amount, 0))}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Montant payé</div>
          <div className="text-2xl font-bold text-green-600">
            {formatAmount(issued.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0))}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Reste à payer</div>
          <div className="text-2xl font-bold text-orange-600">
            {formatAmount(
              issued.reduce((sum, inv) => sum + (inv.total_amount - (inv.paid_amount || 0)), 0)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Invoices;
