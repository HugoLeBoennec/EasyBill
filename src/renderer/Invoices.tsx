/**
 * Invoices Component
 *
 * List and manage invoices and credit notes (avoirs): export, edit (drafts),
 * finalize, mark as sent, record payments, create a credit note, delete
 * (drafts).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { InvoiceComplete } from '../database/types';
import type { InvoiceExportFormat } from '../main/invoice-mapper';
import {
  PAYMENT_METHODS,
  balanceDue,
  eurosToCents,
  overpaidAmount,
} from '../database/repositories/invoice-repository';

type StatusFilter = 'all' | 'draft' | 'finalized' | 'sent' | 'partial' | 'paid' | 'cancelled';
type TypeFilter = 'all' | 'invoice' | 'credit_note';

export interface Feedback {
  type: 'success' | 'error';
  message: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  finalized: 'Finalisée',
  sent: 'Envoyée',
  paid: 'Payée',
  cancelled: 'Annulée par avoir',
  partial: 'Partiellement payée',
};

/** Same statuses for a credit note ("un avoir" is masculine). */
const CREDIT_NOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  finalized: 'Finalisé',
  sent: 'Envoyé',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-800',
  finalized: 'bg-blue-200 text-blue-800',
  sent: 'bg-purple-200 text-purple-800',
  paid: 'bg-green-200 text-green-800',
  cancelled: 'bg-red-200 text-red-800',
  partial: 'bg-yellow-200 text-yellow-800',
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'finalized', label: 'Finalisées' },
  { value: 'sent', label: 'Envoyées' },
  { value: 'partial', label: 'Partiellement payées' },
  { value: 'paid', label: 'Payées' },
  { value: 'cancelled', label: 'Annulées par avoir' },
];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tous les documents' },
  { value: 'invoice', label: 'Factures' },
  { value: 'credit_note', label: 'Avoirs' },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: 'Virement',
  card: 'Carte bancaire',
  check: 'Chèque',
  cash: 'Espèces',
  direct_debit: 'Prélèvement',
  other: 'Autre',
};

type InvoiceLike = {
  status: string;
  payment_status?: string;
  invoice_type?: string;
};

export const isCreditNote = (invoice: { invoice_type?: string }): boolean =>
  invoice.invoice_type === 'credit_note';

/**
 * Status shown to the user: an issued invoice with a payment but still a
 * balance is "partiellement payée" (the stored status stays finalized / sent).
 */
export const displayStatus = (invoice: InvoiceLike): StatusFilter | string =>
  !isCreditNote(invoice) &&
  (invoice.status === 'finalized' || invoice.status === 'sent') &&
  invoice.payment_status === 'partial'
    ? 'partial'
    : invoice.status;

/** Today as YYYY-MM-DD in local time (toISOString would give the UTC day). */
export const todayLocal = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

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

export const StatusBadge = ({
  status,
  paymentStatus,
  invoiceType,
}: {
  status: string;
  paymentStatus?: string;
  invoiceType?: string;
}) => {
  const shown = displayStatus({ status, payment_status: paymentStatus, invoice_type: invoiceType });
  const label =
    (invoiceType === 'credit_note' && CREDIT_NOTE_STATUS_LABELS[shown]) ||
    STATUS_LABELS[shown] ||
    shown;
  return (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
        STATUS_STYLES[shown] || 'bg-gray-200 text-gray-800'
      }`}
    >
      {label}
    </span>
  );
};

/** Document type badge: Facture / Avoir. */
export const TypeBadge = ({ invoiceType }: { invoiceType?: string }) =>
  invoiceType === 'credit_note' ? (
    <span className="px-2 py-0.5 text-xs font-semibold rounded border border-orange-300 bg-orange-50 text-orange-800">
      Avoir
    </span>
  ) : (
    <span className="px-2 py-0.5 text-xs font-semibold rounded border border-blue-200 bg-blue-50 text-blue-800">
      Facture
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
          message: `Document exporté : ${response.data.path}`,
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

/**
 * Inline form recording a payment on an issued invoice (date, amount, method,
 * optional reference). Partial payments are allowed; the amount defaults to
 * the balance due. Not a <form>: it can live inside another form or a table.
 */
export const PaymentForm = ({
  invoiceId,
  balance,
  onRecorded,
  onCancel,
}: {
  invoiceId: number;
  /** Balance still due, in cents */
  balance: number;
  onRecorded: (amountCents: number) => void;
  onCancel: () => void;
}) => {
  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState((balance / 100).toFixed(2).replace('.', ','));
  const [method, setMethod] = useState<string>('transfer');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const value = Number(amount.trim().replace(/\s/g, '').replace(',', '.'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Indiquez la date du paiement.');
      return;
    }
    if (date > todayLocal()) {
      setError('La date de paiement ne peut pas être dans le futur.');
      return;
    }
    if (amount.trim() === '' || !Number.isFinite(value) || value <= 0) {
      setError('Indiquez un montant supérieur à zéro.');
      return;
    }
    if (Math.abs(value * 100 - eurosToCents(value)) > 1e-6) {
      setError('Le montant accepte deux décimales au maximum.');
      return;
    }
    const cents = eurosToCents(value);
    if (cents > balance) {
      setError(`Le montant dépasse le solde restant dû (${formatAmount(balance)}).`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await window.electron.invoice.recordPayment(invoiceId, {
        payment_date: date,
        amount: cents,
        payment_method: method,
        payment_reference: reference.trim() || null,
      });
      if (response.success) {
        onRecorded(cents);
      } else {
        setError(response.error || "L'enregistrement du paiement a échoué.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "L'enregistrement du paiement a échoué.");
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500';
  const label = 'block text-xs font-medium text-gray-700 mb-1';
  const idPrefix = `payment-${invoiceId}`;

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left font-normal">
      <div className="flex flex-wrap justify-between items-baseline gap-2 mb-3">
        <h3 className="font-semibold text-gray-900">Enregistrer un paiement</h3>
        <span className="text-sm text-gray-700">Solde restant dû : {formatAmount(balance)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className={label} htmlFor={`${idPrefix}-date`}>
            Date du paiement *
          </label>
          <input
            id={`${idPrefix}-date`}
            type="date"
            className={field}
            value={date}
            max={todayLocal()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor={`${idPrefix}-amount`}>
            Montant (€) *
          </label>
          <input
            id={`${idPrefix}-amount`}
            type="text"
            inputMode="decimal"
            className={field}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor={`${idPrefix}-method`}>
            Mode de paiement *
          </label>
          <select
            id={`${idPrefix}-method`}
            className={field}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${idPrefix}-reference`}>
            Référence (optionnel)
          </label>
          <input
            id={`${idPrefix}-reference`}
            type="text"
            className={field}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="N° de chèque, libellé du virement…"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 mt-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 mt-3">
        <button
          type="button"
          className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm disabled:opacity-50"
          onClick={onCancel}
          disabled={saving}
        >
          Annuler
        </button>
        <button
          type="button"
          className="px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50"
          onClick={submit}
          disabled={saving}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer le paiement'}
        </button>
      </div>
    </div>
  );
};

type PendingConfirmation = { id: number; action: 'delete' | 'finalize' } | null;

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<InvoiceComplete[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [confirmation, setConfirmation] = useState<PendingConfirmation>(null);
  const [paymentFor, setPaymentFor] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Everything is loaded once and filtered here: the links between invoices
  // and credit notes must not depend on the active filters.
  const loadInvoices = useCallback(async () => {
    try {
      const response = await window.electron.invoice.list({});

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
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  /** Credit notes of each invoice (original id -> credit notes, oldest first). */
  const creditNotesByInvoice = useMemo(() => {
    const map = new Map<number, InvoiceComplete[]>();
    for (const inv of invoices) {
      if (isCreditNote(inv) && inv.credited_invoice_id) {
        const list = map.get(inv.credited_invoice_id) || [];
        list.unshift(inv); // the list is sorted most recent first
        map.set(inv.credited_invoice_id, list);
      }
    }
    return map;
  }, [invoices]);

  const visible = useMemo(
    () =>
      invoices.filter((inv) => {
        if (typeFilter === 'credit_note' && !isCreditNote(inv)) return false;
        if (typeFilter === 'invoice' && isCreditNote(inv)) return false;
        return filter === 'all' || displayStatus(inv) === filter;
      }),
    [invoices, filter, typeFilter]
  );

  /** Run an action on one invoice, then refresh the list and report the outcome. */
  const runAction = async (
    id: number,
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string | (() => string),
    failureMessage: string
  ) => {
    setBusyId(id);
    setConfirmation(null);
    setPaymentFor(null);
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

  const handleFinalize = (id: number, creditNote: boolean) => {
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
        creditNote
          ? `Avoir émis${finalizedNumber ? ` sous le numéro ${finalizedNumber}` : ''}.`
          : finalizedNumber
          ? `Facture finalisée sous le numéro ${finalizedNumber}.`
          : 'Facture finalisée.',
      'La finalisation a échoué.'
    );
  };

  const handleMarkSent = (id: number, creditNote: boolean) =>
    runAction(
      id,
      () => window.electron.invoice.markSent(id),
      creditNote ? 'Avoir marqué comme envoyé.' : 'Facture marquée comme envoyée.',
      "Impossible de marquer le document comme envoyé."
    );

  /** Create (or reopen) the draft credit note of an invoice and open it. */
  const handleCreateCreditNote = async (id: number) => {
    setBusyId(id);
    setFeedback(null);
    setPaymentFor(null);
    try {
      const response = await window.electron.invoice.createCreditNote(id);
      if (response.success && response.data) {
        navigate(`/invoices/${response.data}`);
        return;
      }
      setFeedback({ type: 'error', message: response.error || "La création de l'avoir a échoué." });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : "La création de l'avoir a échoué.",
      });
    }
    setBusyId(null);
  };

  const handlePaymentRecorded = async (invoice: InvoiceComplete, amount: number) => {
    setPaymentFor(null);
    await loadInvoices();
    const settled = amount >= balanceDue(invoice);
    setFeedback({
      type: 'success',
      message: `Paiement de ${formatAmount(amount)} enregistré sur la facture ${invoice.invoice_number}${
        settled ? ' : elle est soldée.' : '.'
      }`,
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  // Footer statistics: drafts never count, credit notes are subtracted
  const issued = visible.filter((inv) => inv.status !== 'draft');
  const issuedInvoices = issued.filter((inv) => !isCreditNote(inv));
  const invoicedTotal = issuedInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const creditedTotal = issued
    .filter(isCreditNote)
    .reduce((sum, inv) => sum + inv.total_amount, 0);
  const paidTotal = issuedInvoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
  const dueTotal = issuedInvoices
    .filter((inv) => inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + balanceDue(inv), 0);

  const actionLink = 'hover:underline disabled:opacity-50 disabled:no-underline';
  const selectClass =
    'px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-800 focus:ring-2 focus:ring-blue-500';
  const COLUMNS = ['Numéro', 'Client', 'Date', 'Montant TTC', 'Reste dû', 'Statut', 'E-Invoicing'];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Factures</h1>
          <p className="text-gray-600 mt-1">
            Gérez vos factures, avoirs et paiements, et leur conformité e-invoicing
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
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="filter-type">
            Type de document
          </label>
          <select
            id="filter-type"
            className={selectClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            {TYPE_FILTERS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="filter-status">
            Statut
          </label>
          <select
            id="filter-status"
            className={selectClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTERS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(filter !== 'all' || typeFilter !== 'all') && (
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline pb-2"
            onClick={() => {
              setFilter('all');
              setTypeFilter('all');
            }}
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* Success / error messages */}
      <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      {/* Invoice Table */}
      {visible.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">
            {invoices.length === 0
              ? 'Aucune facture trouvée'
              : 'Aucun document ne correspond aux filtres'}
          </p>
          <Link
            to="/invoices/new"
            className="text-blue-600 hover:underline mt-2 inline-block"
          >
            {invoices.length === 0 ? 'Créer votre première facture' : 'Créer une facture'}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {COLUMNS.map((title) => (
                  <th
                    key={title}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {title}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {visible.map((invoice) => {
                const id = invoice.id as number;
                const isDraft = invoice.status === 'draft';
                const creditNote = isCreditNote(invoice);
                const busy = busyId === id;
                const confirming = confirmation?.id === id ? confirmation.action : null;
                const balance = isDraft ? 0 : balanceDue(invoice);
                const overpaid = isDraft ? 0 : overpaidAmount(invoice);
                const credited = invoice.credited_amount || 0;
                const linkedCreditNotes = creditNotesByInvoice.get(id) || [];
                const canPay =
                  !creditNote && !isDraft && invoice.status !== 'cancelled' && balance > 0;
                const canCredit =
                  !creditNote && !isDraft && invoice.total_amount - credited > 0;
                const hasDraftCreditNote = linkedCreditNotes.some((cn) => cn.status === 'draft');

                return [
                  <tr key={id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <TypeBadge invoiceType={invoice.invoice_type} />
                        <Link
                          to={`/invoices/${id}`}
                          className={`hover:underline font-medium ${
                            isDraft ? 'text-gray-500 italic' : 'text-blue-600'
                          }`}
                        >
                          {displayInvoiceNumber(invoice)}
                        </Link>
                      </div>
                      {creditNote && invoice.credited_invoice_id && (
                        <div className="text-xs text-gray-600 mt-1">
                          Sur la facture{' '}
                          <Link
                            to={`/invoices/${invoice.credited_invoice_id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {invoice.credited_invoice_number || `n° ${invoice.credited_invoice_id}`}
                          </Link>
                        </div>
                      )}
                      {linkedCreditNotes.length > 0 && (
                        <div className="text-xs text-gray-600 mt-1">
                          {linkedCreditNotes.length > 1 ? 'Avoirs : ' : 'Avoir : '}
                          {linkedCreditNotes.map((cn, index) => (
                            <span key={cn.id}>
                              {index > 0 && ', '}
                              <Link
                                to={`/invoices/${cn.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                {cn.status === 'draft' ? 'brouillon' : cn.invoice_number}
                              </Link>
                            </span>
                          ))}
                        </div>
                      )}
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
                      <div
                        className={`text-sm font-medium ${
                          creditNote ? 'text-orange-700' : 'text-gray-900'
                        }`}
                      >
                        {creditNote ? '− ' : ''}
                        {formatAmount(invoice.total_amount)}
                      </div>
                      {!isDraft && !creditNote && (invoice.paid_amount || 0) > 0 && (
                        <div className="text-xs text-gray-500">
                          Payé : {formatAmount(invoice.paid_amount || 0)}
                        </div>
                      )}
                      {!creditNote && credited > 0 && (
                        <div className="text-xs text-orange-700">
                          Avoir : − {formatAmount(credited)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      {isDraft || creditNote ? (
                        <span className="text-gray-400">-</span>
                      ) : overpaid > 0 ? (
                        <span className="text-orange-700" title="Montant encaissé supérieur au montant dû après avoir">
                          À rembourser : {formatAmount(overpaid)}
                        </span>
                      ) : (
                        <span
                          className={balance > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}
                        >
                          {formatAmount(balance)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge
                        status={invoice.status}
                        paymentStatus={invoice.payment_status}
                        invoiceType={invoice.invoice_type}
                      />
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
                              : creditNote
                              ? "Émettre cet avoir ? Un numéro définitif sera attribué, il ne sera plus modifiable et le solde de la facture d'origine sera réduit."
                              : 'Finaliser ? Un numéro définitif sera attribué et la facture ne sera plus modifiable.'}
                          </span>
                          <button
                            type="button"
                            className={`${actionLink} ${
                              confirming === 'delete' ? 'text-red-600' : 'text-green-700'
                            }`}
                            onClick={() =>
                              confirming === 'delete'
                                ? handleDelete(id)
                                : handleFinalize(id, creditNote)
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
                                {creditNote ? "Émettre l'avoir" : 'Finaliser'}
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
                                  onClick={() => handleMarkSent(id, creditNote)}
                                >
                                  {creditNote ? 'Marquer envoyé' : 'Marquer envoyée'}
                                </button>
                              )}
                              {canPay && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={`${actionLink} text-green-700`}
                                  aria-expanded={paymentFor === id}
                                  onClick={() => setPaymentFor(paymentFor === id ? null : id)}
                                >
                                  Enregistrer un paiement
                                </button>
                              )}
                              {canCredit && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className={`${actionLink} text-orange-700`}
                                  title="Corriger ou annuler cette facture par une facture d'avoir"
                                  onClick={() => handleCreateCreditNote(id)}
                                >
                                  {hasDraftCreditNote ? "Reprendre l'avoir" : 'Créer un avoir'}
                                </button>
                              )}
                              <InvoiceExportButtons invoiceId={id} onFeedback={setFeedback} />
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>,
                  paymentFor === id && canPay ? (
                    <tr key={`${id}-payment`}>
                      <td colSpan={COLUMNS.length + 1} className="px-4 py-3 bg-gray-50">
                        <PaymentForm
                          invoiceId={id}
                          balance={balance}
                          onRecorded={(amount) => handlePaymentRecorded(invoice, amount)}
                          onCancel={() => setPaymentFor(null)}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats (drafts are not issued documents; credit notes are subtracted) */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Documents affichés</div>
          <div className="text-2xl font-bold text-gray-900">{visible.length}</div>
          <div className="text-xs text-gray-500 mt-1">
            {visible.filter((inv) => !isCreditNote(inv)).length} facture(s),{' '}
            {visible.filter(isCreditNote).length} avoir(s)
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Facturé TTC, net des avoirs</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatAmount(invoicedTotal - creditedTotal)}
          </div>
          {creditedTotal > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {formatAmount(invoicedTotal)} − {formatAmount(creditedTotal)} d'avoirs
            </div>
          )}
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Montant encaissé</div>
          <div className="text-2xl font-bold text-green-600">{formatAmount(paidTotal)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Reste à encaisser</div>
          <div className="text-2xl font-bold text-orange-600">{formatAmount(dueTotal)}</div>
        </div>
      </div>
    </div>
  );
};

export default Invoices;
