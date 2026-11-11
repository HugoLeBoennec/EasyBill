/**
 * Invoice Form Component
 *
 * - /invoices/new  : create a draft
 * - /invoices/:id  : edit a draft, or display an issued invoice read-only
 *   (an issued invoice can no longer be modified) with its export buttons.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Invoice, InvoicePayment } from '../database/types';
import {
  computeInvoiceTotals,
  computeLineAmounts,
  eurosToCents,
} from '../database/repositories/invoice-repository';
import {
  FeedbackBanner,
  InvoiceExportButtons,
  StatusBadge,
  displayInvoiceNumber,
  formatAmount,
  formatDate,
} from './Invoices';
import type { Feedback } from './Invoices';

interface Customer {
  id: number;
  legal_name: string;
  siret?: string;
}

interface LineItem {
  /** React key, local to the form */
  key: string;
  /** Database id of an already saved line */
  dbId?: number;
  item_name: string;
  item_description: string;
  /** Raw input values: kept as text so that the user can type freely */
  quantity: string;
  unit_price: string; // euros, excluding VAT
  vat_rate: number;
  unit_code: string;
}

interface LineErrors {
  item_name?: string;
  quantity?: string;
  unit_price?: string;
}

interface FormErrors {
  invoiceDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  customer?: string;
  lines?: string;
  lineItems: Record<string, LineErrors>;
}

const VAT_RATES = [0, 2.1, 5.5, 10, 20];

const NO_ERRORS: FormErrors = { lineItems: {} };

/** Today as YYYY-MM-DD in local time (toISOString would give the UTC day). */
const todayLocal = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Add days to a YYYY-MM-DD date (pure calendar arithmetic, no time zone). */
const addDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 86400000) : 0;
};

/** Accept both "12.5" and "12,5". */
const parseDecimal = (value: string): number => {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
};

const centsToInput = (cents: number): string => (cents / 100).toFixed(2);

let lineKeyCounter = 0;
const newLineKey = (): string => `line-${Date.now()}-${lineKeyCounter++}`;

const emptyLine = (): LineItem => ({
  key: newLineKey(),
  item_name: '',
  item_description: '',
  quantity: '1',
  unit_price: '',
  vat_rate: 20,
  unit_code: 'C62',
});

const inputClass = (hasError?: boolean, small = false): string =>
  `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-700 ${
    small ? 'text-sm ' : ''
  }${hasError ? 'border-red-500' : 'border-gray-300'}`;

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="text-xs text-red-600 mt-1">{message}</p> : null;

const InvoiceForm = () => {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const invoiceId = params.id !== undefined ? Number(params.id) : null;
  const isEdit = invoiceId !== null;

  const [loadingInvoice, setLoadingInvoice] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  // Existing invoice (edit / read-only)
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);

  // Form fields
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [dueDate, setDueDate] = useState(addDays(todayLocal(), 30));
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const topRef = useRef<HTMLDivElement>(null);

  const readOnly = isEdit && invoice !== null && invoice.status !== 'draft';

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    let cancelled = false;

    const resetForCreation = () => {
      const today = todayLocal();
      setInvoice(null);
      setPayments([]);
      setInvoiceDate(today);
      setPaymentTerms('30');
      setDueDate(addDays(today, 30));
      setCustomerId('');
      setNotes('');
      setLineItems([]);
      setLoadingInvoice(false);
    };

    const loadCustomers = async (): Promise<Customer[]> => {
      const response = await window.electron.party.getCustomers(true);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Impossible de charger les clients.');
      }
      return response.data
        .filter((party) => party.id !== undefined)
        .map((party) => ({
          id: party.id as number,
          legal_name: party.legal_name,
          siret: party.siret,
        }));
    };

    const load = async () => {
      setLoadError(null);
      setFeedback(null);
      setErrors(NO_ERRORS);
      setConfirmFinalize(false);
      setLoadingCustomers(true);

      let customerList: Customer[] = [];
      try {
        customerList = await loadCustomers();
      } catch (err: unknown) {
        if (!cancelled) {
          setFeedback({
            type: 'error',
            message: err instanceof Error ? err.message : 'Impossible de charger les clients.',
          });
        }
      }
      if (cancelled) return;

      if (invoiceId === null) {
        setCustomers(customerList);
        setLoadingCustomers(false);
        resetForCreation();
        return;
      }

      setLoadingInvoice(true);
      try {
        if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
          throw new Error('Facture introuvable.');
        }
        const [invoiceResp, linesResp] = await Promise.all([
          window.electron.invoice.get(invoiceId),
          window.electron.invoice.getLines(invoiceId),
        ]);
        if (!invoiceResp.success || !invoiceResp.data) {
          throw new Error(invoiceResp.error || 'Facture introuvable.');
        }
        if (!linesResp.success || !linesResp.data) {
          throw new Error(linesResp.error || 'Impossible de charger les lignes de la facture.');
        }
        const loaded = invoiceResp.data;

        // The buyer may have been deactivated since: keep it selectable
        if (loaded.buyer_id && !customerList.some((c) => c.id === loaded.buyer_id)) {
          const buyerResp = await window.electron.party.get(loaded.buyer_id);
          if (buyerResp.success && buyerResp.data) {
            customerList = [
              ...customerList,
              {
                id: loaded.buyer_id,
                legal_name: buyerResp.data.legal_name,
                siret: buyerResp.data.siret,
              },
            ];
          }
        }

        let loadedPayments: InvoicePayment[] = [];
        if (loaded.status === 'paid' || (loaded.paid_amount || 0) > 0) {
          const paymentsResp = await window.electron.invoice.getPayments(invoiceId);
          if (paymentsResp.success && paymentsResp.data) loadedPayments = paymentsResp.data;
        }
        if (cancelled) return;

        const date = (loaded.invoice_date || '').slice(0, 10);
        const due = (loaded.due_date || '').slice(0, 10);
        setCustomers(customerList);
        setInvoice(loaded);
        setPayments(loadedPayments);
        setInvoiceDate(date);
        setDueDate(due);
        setPaymentTerms(
          String(loaded.payment_terms_days ?? (date && due ? Math.max(0, daysBetween(date, due)) : 30))
        );
        setCustomerId(loaded.buyer_id ?? '');
        setNotes(loaded.notes || '');
        setLineItems(
          linesResp.data.map((line) => ({
            key: newLineKey(),
            dbId: line.id,
            item_name: line.item_name,
            item_description: line.item_description || '',
            quantity: String(line.quantity),
            unit_price: centsToInput(line.unit_price),
            vat_rate: line.vat_rate,
            unit_code: line.unit_code || 'C62',
          }))
        );
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Impossible de charger la facture.');
        }
      } finally {
        if (!cancelled) {
          setLoadingInvoice(false);
          setLoadingCustomers(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  // ---------------------------------------------------------------- editing

  const handleInvoiceDateChange = (value: string) => {
    setInvoiceDate(value);
    const terms = Number(paymentTerms);
    if (value && Number.isInteger(terms) && terms >= 0) {
      setDueDate(addDays(value, terms));
    }
  };

  const handlePaymentTermsChange = (value: string) => {
    setPaymentTerms(value);
    const terms = Number(value);
    if (invoiceDate && value.trim() !== '' && Number.isInteger(terms) && terms >= 0) {
      setDueDate(addDays(invoiceDate, terms));
    }
  };

  const handleDueDateChange = (value: string) => {
    setDueDate(value);
    if (invoiceDate && value && value >= invoiceDate) {
      setPaymentTerms(String(daysBetween(invoiceDate, value)));
    }
  };

  const addLineItem = () => {
    setLineItems((items) => [...items, emptyLine()]);
    setErrors((current) => ({ ...current, lines: undefined }));
  };

  const removeLineItem = (key: string) => {
    setLineItems((items) => items.filter((item) => item.key !== key));
  };

  const updateLineItem = <K extends keyof LineItem>(key: string, field: K, value: LineItem[K]) => {
    setLineItems((items) =>
      items.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  };

  // Amounts in cents, computed exactly like the repository does when saving
  const computed = useMemo(() => {
    const lines = lineItems.map((item) => {
      const quantity = parseDecimal(item.quantity);
      const unitPrice = parseDecimal(item.unit_price);
      const valid = Number.isFinite(quantity) && Number.isFinite(unitPrice);
      const amounts = valid
        ? computeLineAmounts(quantity, eurosToCents(unitPrice), item.vat_rate)
        : { line_amount: 0, line_total: 0, vat_amount: 0 };
      return { line_total: amounts.line_total, vat_rate: item.vat_rate };
    });
    return { lines, totals: computeInvoiceTotals(lines) };
  }, [lineItems]);

  const validate = (): FormErrors => {
    const result: FormErrors = { lineItems: {} };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      result.invoiceDate = 'La date de facture est obligatoire.';
    }
    if (dueDate && invoiceDate && dueDate < invoiceDate) {
      result.dueDate = "La date d'échéance ne peut pas précéder la date de facture.";
    }
    const terms = Number(paymentTerms);
    if (paymentTerms.trim() === '' || !Number.isInteger(terms) || terms < 0) {
      result.paymentTerms = 'Indiquez un nombre de jours entier, positif ou nul.';
    }
    if (!customerId) {
      result.customer = 'Veuillez sélectionner un client.';
    }
    if (lineItems.length === 0) {
      result.lines = 'Veuillez ajouter au moins une ligne.';
    }

    for (const item of lineItems) {
      const lineErrors: LineErrors = {};
      if (!item.item_name.trim()) {
        lineErrors.item_name = 'La désignation est obligatoire.';
      }
      const quantity = parseDecimal(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        lineErrors.quantity = 'Quantité supérieure à zéro requise.';
      }
      const unitPrice = parseDecimal(item.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        lineErrors.unit_price = 'Prix unitaire invalide.';
      } else if (Math.abs(unitPrice * 100 - eurosToCents(unitPrice)) > 1e-6) {
        lineErrors.unit_price = 'Deux décimales au maximum.';
      }
      if (Object.keys(lineErrors).length > 0) {
        result.lineItems[item.key] = lineErrors;
      }
    }
    return result;
  };

  const hasErrors = (e: FormErrors): boolean =>
    Boolean(e.invoiceDate || e.dueDate || e.paymentTerms || e.customer || e.lines) ||
    Object.keys(e.lineItems).length > 0;

  /** Save the draft; returns its id, or null when validation / saving failed. */
  const saveDraft = async (): Promise<number | null> => {
    const validation = validate();
    setErrors(validation);
    if (hasErrors(validation)) {
      setFeedback({
        type: 'error',
        message: 'Le formulaire contient des erreurs : corrigez les champs signalés.',
      });
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
      return null;
    }

    const response = await window.electron.invoice.saveDraft(
      invoiceId,
      {
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        buyer_id: customerId as number,
        seller_id: invoice?.seller_id ?? null,
        payment_terms_days: Number(paymentTerms),
        notes: notes.trim() || null,
        buyer_reference: invoice?.buyer_reference ?? null,
        purchase_order_ref: invoice?.purchase_order_ref ?? null,
        currency: invoice?.currency || 'EUR',
        invoice_type: invoice?.invoice_type || 'invoice',
      },
      lineItems.map((item) => ({
        id: item.dbId,
        item_name: item.item_name.trim(),
        item_description: item.item_description.trim() || null,
        quantity: parseDecimal(item.quantity),
        unit_code: item.unit_code,
        unit_price: eurosToCents(parseDecimal(item.unit_price)),
        vat_rate: item.vat_rate,
      }))
    );

    if (!response.success || !response.data) {
      setFeedback({
        type: 'error',
        message: response.error || "L'enregistrement de la facture a échoué.",
      });
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
      return null;
    }
    return response.data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const savedId = await saveDraft();
      if (savedId !== null) navigate('/invoices');
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : "L'enregistrement de la facture a échoué.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndFinalize = async () => {
    if (readOnly || saving) return;
    setSaving(true);
    setFeedback(null);
    setConfirmFinalize(false);
    try {
      const savedId = await saveDraft();
      if (savedId === null) return;

      const response = await window.electron.invoice.finalize(savedId);
      if (!response.success) {
        setFeedback({
          type: 'error',
          message:
            (response.error || 'La finalisation a échoué.') +
            '\nLa facture a été enregistrée comme brouillon.',
        });
        // The draft now exists: continue on its own page
        if (invoiceId === null) navigate(`/invoices/${savedId}`, { replace: true });
        return;
      }
      // Show the issued invoice (read-only, with its number and export buttons)
      if (invoiceId === savedId) {
        const refreshed = await window.electron.invoice.get(savedId);
        if (refreshed.success && refreshed.data) setInvoice(refreshed.data);
        setFeedback({ type: 'success', message: 'Facture finalisée.' });
      } else {
        navigate(`/invoices/${savedId}`, { replace: true });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'La finalisation a échoué.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/invoices');
  };

  // ---------------------------------------------------------------- render

  if (loadingInvoice) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div role="alert" className="bg-red-50 border border-red-400 text-red-800 px-4 py-3 rounded mb-4">
          {loadError}
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Retour aux factures
        </button>
      </div>
    );
  }

  const { totals } = computed;
  // An issued invoice shows the amounts stored when it was issued
  const shownTotals =
    readOnly && invoice
      ? {
          subtotal: invoice.subtotal_amount,
          tax: invoice.tax_amount,
          total: invoice.total_amount,
        }
      : { subtotal: totals.subtotal_amount, tax: totals.tax_amount, total: totals.total_amount };

  const title = !isEdit
    ? 'Nouvelle facture'
    : readOnly
    ? `Facture ${invoice?.invoice_number ?? ''}`
    : 'Modifier le brouillon';

  const lastPayment = payments[0];

  return (
    <div className="p-6" ref={topRef}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            {title}
            {invoice && <StatusBadge status={invoice.status} />}
          </h1>
          <p className="text-gray-600 mt-1">
            {!isEdit && 'Créer une nouvelle facture (brouillon)'}
            {isEdit && !readOnly && 'Le brouillon reste modifiable tant qu\'il n\'est pas finalisé.'}
            {readOnly &&
              "Cette facture a été émise : elle n'est plus modifiable. Pour la corriger, émettez une facture d'avoir."}
          </p>
        </div>
        {readOnly && invoice?.id !== undefined && invoice.status !== 'cancelled' && (
          <InvoiceExportButtons invoiceId={invoice.id} onFeedback={setFeedback} variant="button" />
        )}
      </div>

      <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} noValidate>
          <fieldset disabled={readOnly || saving} className="space-y-6 min-w-0">
            {/* Invoice Info */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Informations de la facture
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéro de facture
                  </label>
                  <input
                    type="text"
                    className={inputClass()}
                    value={invoice && readOnly ? displayInvoiceNumber(invoice) : ''}
                    placeholder="Attribué à la finalisation"
                    disabled
                    readOnly
                  />
                  {!readOnly && (
                    <p className="text-xs text-gray-500 mt-1">
                      Le numéro définitif est attribué automatiquement lors de la finalisation
                      (numérotation continue).
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="invoice-date">
                    Date de facture *
                  </label>
                  <input
                    id="invoice-date"
                    type="date"
                    className={inputClass(Boolean(errors.invoiceDate))}
                    value={invoiceDate}
                    onChange={(e) => handleInvoiceDateChange(e.target.value)}
                  />
                  <FieldError message={errors.invoiceDate} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="due-date">
                    Date d'échéance
                  </label>
                  <input
                    id="due-date"
                    type="date"
                    className={inputClass(Boolean(errors.dueDate))}
                    value={dueDate}
                    min={invoiceDate || undefined}
                    onChange={(e) => handleDueDateChange(e.target.value)}
                  />
                  <FieldError message={errors.dueDate} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="payment-terms">
                    Délai de paiement (jours)
                  </label>
                  <input
                    id="payment-terms"
                    type="number"
                    className={inputClass(Boolean(errors.paymentTerms))}
                    value={paymentTerms}
                    onChange={(e) => handlePaymentTermsChange(e.target.value)}
                    min={0}
                    step={1}
                  />
                  <FieldError message={errors.paymentTerms} />
                </div>
              </div>
              {readOnly && invoice && (
                <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-sm text-gray-700">
                  {invoice.finalized_at && (
                    <div>
                      <dt className="font-medium">Finalisée le</dt>
                      <dd>{formatDate(invoice.finalized_at)}</dd>
                    </div>
                  )}
                  {invoice.sent_at && (
                    <div>
                      <dt className="font-medium">Envoyée le</dt>
                      <dd>{formatDate(invoice.sent_at)}</dd>
                    </div>
                  )}
                  {(invoice.status === 'paid' || lastPayment) && (
                    <div>
                      <dt className="font-medium">
                        {invoice.status === 'paid' ? 'Payée le' : 'Dernier paiement le'}
                      </dt>
                      <dd>
                        {lastPayment ? formatDate(lastPayment.payment_date) : '-'}
                        {' — '}
                        {formatAmount(invoice.paid_amount || 0)} réglés
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>

            {/* Customer Selection */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Client</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="customer">
                  Sélectionner un client *
                </label>
                <select
                  id="customer"
                  className={inputClass(Boolean(errors.customer))}
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value ? Number(e.target.value) : '');
                    setErrors((current) => ({ ...current, customer: undefined }));
                  }}
                  disabled={loadingCustomers}
                >
                  <option value="">-- Choisir un client --</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.legal_name}
                      {customer.siret && ` (SIRET: ${customer.siret})`}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.customer} />
                {loadingCustomers && (
                  <p className="text-xs text-gray-500 mt-1">Chargement des clients...</p>
                )}
                {!loadingCustomers && customers.length === 0 && !readOnly && (
                  <p className="text-xs text-gray-500 mt-1">
                    Aucun client enregistré : créez d'abord un client dans l'onglet Clients.
                  </p>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Articles / Services</h2>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                  >
                    + Ajouter une ligne
                  </button>
                )}
              </div>

              {lineItems.length === 0 ? (
                <div
                  className={`bg-gray-50 rounded-lg p-8 text-center ${
                    errors.lines ? 'border border-red-500' : ''
                  }`}
                >
                  <p className="text-gray-600">Aucun article ajouté</p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="mt-3 text-blue-600 hover:underline text-sm"
                    >
                      Ajouter votre premier article
                    </button>
                  )}
                  <FieldError message={errors.lines} />
                </div>
              ) : (
                <div className="space-y-4">
                  {lineItems.map((item, index) => {
                    const lineErrors = errors.lineItems[item.key] || {};
                    return (
                      <div
                        key={item.key}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-medium text-gray-900">Ligne {index + 1}</h3>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(item.key)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="lg:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Désignation *
                            </label>
                            <input
                              type="text"
                              className={inputClass(Boolean(lineErrors.item_name), true)}
                              value={item.item_name}
                              onChange={(e) =>
                                updateLineItem(item.key, 'item_name', e.target.value)
                              }
                              placeholder="Nom du produit/service"
                            />
                            <FieldError message={lineErrors.item_name} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Quantité *
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              className={inputClass(Boolean(lineErrors.quantity), true)}
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(item.key, 'quantity', e.target.value)
                              }
                            />
                            <FieldError message={lineErrors.quantity} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Prix unitaire HT (€) *
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              className={inputClass(Boolean(lineErrors.unit_price), true)}
                              value={item.unit_price}
                              onChange={(e) =>
                                updateLineItem(item.key, 'unit_price', e.target.value)
                              }
                              placeholder="0,00"
                            />
                            <FieldError message={lineErrors.unit_price} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              TVA (%)
                            </label>
                            <select
                              className={inputClass(false, true)}
                              value={item.vat_rate}
                              onChange={(e) =>
                                updateLineItem(item.key, 'vat_rate', Number(e.target.value))
                              }
                            >
                              {(VAT_RATES.includes(item.vat_rate)
                                ? VAT_RATES
                                : [...VAT_RATES, item.vat_rate]
                              ).map((rate) => (
                                <option key={rate} value={rate}>
                                  {String(rate).replace('.', ',')} %
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="lg:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Description
                            </label>
                            <input
                              type="text"
                              className={inputClass(false, true)}
                              value={item.item_description}
                              onChange={(e) =>
                                updateLineItem(item.key, 'item_description', e.target.value)
                              }
                              placeholder="Description optionnelle"
                            />
                          </div>
                          <div className="flex items-end">
                            <div className="w-full">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Total HT
                              </label>
                              <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium">
                                {formatAmount(computed.lines[index]?.line_total ?? 0)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Totals */}
            {lineItems.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-4">Récapitulatif</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-gray-700">
                    <span>Total HT :</span>
                    <span className="font-medium">{formatAmount(shownTotals.subtotal)}</span>
                  </div>
                  {totals.vat_breakdown.map((entry) => (
                    <div
                      key={`${entry.vat_category}-${entry.vat_rate}`}
                      className="flex justify-between text-gray-700 text-sm"
                    >
                      <span>
                        TVA {String(entry.vat_rate).replace('.', ',')} % sur{' '}
                        {formatAmount(entry.taxable_amount)} :
                      </span>
                      <span>{formatAmount(entry.tax_amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-gray-700">
                    <span>Total TVA :</span>
                    <span className="font-medium">{formatAmount(shownTotals.tax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-blue-300">
                    <span>Total TTC :</span>
                    <span>{formatAmount(shownTotals.total)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="notes">
                Notes {readOnly ? '' : '(optionnel)'}
              </label>
              <textarea
                id="notes"
                className={inputClass()}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={readOnly ? '' : 'Conditions de paiement, remarques...'}
              />
            </div>
          </fieldset>

          {/* Actions (outside the fieldset: "Retour" stays usable on a read-only invoice) */}
          <div className="flex flex-wrap justify-end items-center gap-3 pt-6 mt-6 border-t">
            {readOnly ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Retour aux factures
              </button>
            ) : confirmFinalize ? (
              <>
                <span className="text-sm text-gray-700">
                  Finaliser ? Un numéro définitif sera attribué et la facture ne sera plus
                  modifiable.
                </span>
                <button
                  type="button"
                  onClick={handleSaveAndFinalize}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  disabled={saving}
                >
                  Confirmer la finalisation
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmFinalize(false)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Annuler
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmFinalize(true)}
                  className="px-6 py-2 border border-green-600 text-green-700 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                  disabled={saving}
                >
                  Enregistrer et finaliser
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  disabled={saving}
                >
                  {saving
                    ? 'Enregistrement...'
                    : isEdit
                    ? 'Enregistrer le brouillon'
                    : 'Créer le brouillon'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvoiceForm;
