/**
 * Invoice Form Component
 *
 * - /invoices/new  : create a draft
 * - /invoices/:id  : edit a draft, or display an issued invoice read-only
 *   (an issued invoice can no longer be modified) with its export buttons,
 *   its payments and its credit notes.
 *
 * The same form handles credit notes (avoirs): a credit note is created from
 * an issued invoice, keeps its customer and can only be reduced (quantities /
 * lines) before being issued.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Invoice, InvoicePayment } from '../database/types';
import {
  balanceDue,
  computeInvoiceTotals,
  computeLineAmounts,
  creditableAmount,
  eurosToCents,
  overpaidAmount,
} from '../database/repositories/invoice-repository';
import {
  FeedbackBanner,
  InvoiceExportButtons,
  PAYMENT_METHOD_LABELS,
  PaymentForm,
  StatusBadge,
  TypeBadge,
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

const DEFAULT_VAT_RATE = 20;

const emptyLine = (vatRate: number = DEFAULT_VAT_RATE): LineItem => ({
  key: newLineKey(),
  item_name: '',
  item_description: '',
  quantity: '1',
  unit_price: '',
  vat_rate: vatRate,
  unit_code: 'C62',
});

/**
 * Company settings that shape a new invoice. Read defensively: the columns
 * (VAT franchise flag, default payment terms) may not exist on older databases.
 */
const loadCompanyDefaults = async (): Promise<{ vatRate: number; paymentTerms: number | null }> => {
  try {
    const response = await window.electron.party.getCompany();
    const company = (response.success ? response.data : null) as
      | { vat_franchise?: unknown; default_payment_terms_days?: unknown }
      | null
      | undefined;
    const franchise = Boolean(company && Number(company.vat_franchise));
    const terms = company?.default_payment_terms_days;
    return {
      // VAT franchise (art. 293 B du CGI): lines are issued without VAT
      vatRate: franchise ? 0 : DEFAULT_VAT_RATE,
      paymentTerms:
        typeof terms === 'number' && Number.isInteger(terms) && terms >= 0 ? terms : null,
    };
  } catch {
    return { vatRate: DEFAULT_VAT_RATE, paymentTerms: null };
  }
};

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
  // Credit notes of this invoice / original invoice of this credit note
  const [creditNotes, setCreditNotes] = useState<Invoice[]>([]);
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // VAT rate of new lines (0 when the company is under the VAT franchise)
  const [defaultVatRate, setDefaultVatRate] = useState(DEFAULT_VAT_RATE);

  // Form fields
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [dueDate, setDueDate] = useState(addDays(todayLocal(), 30));
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const topRef = useRef<HTMLDivElement>(null);

  const readOnly = isEdit && invoice !== null && invoice.status !== 'draft';
  const creditNote = invoice?.invoice_type === 'credit_note';

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    let cancelled = false;

    const resetForCreation = (terms: number) => {
      const today = todayLocal();
      setInvoice(null);
      setPayments([]);
      setCreditNotes([]);
      setOriginalInvoice(null);
      setInvoiceDate(today);
      setPaymentTerms(String(terms));
      setDueDate(addDays(today, terms));
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
      setShowPaymentForm(false);
      setConfirmDeletePayment(null);
      setLoadingCustomers(true);

      const companyDefaults = await loadCompanyDefaults();
      if (cancelled) return;
      setDefaultVatRate(companyDefaults.vatRate);

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
        resetForCreation(companyDefaults.paymentTerms ?? 30);
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
        let loadedCreditNotes: Invoice[] = [];
        let loadedOriginal: Invoice | null = null;
        if (loaded.invoice_type === 'credit_note') {
          if (loaded.credited_invoice_id) {
            const originalResp = await window.electron.invoice.get(loaded.credited_invoice_id);
            if (originalResp.success && originalResp.data) loadedOriginal = originalResp.data;
          }
        } else if (loaded.status !== 'draft') {
          const [paymentsResp, creditNotesResp] = await Promise.all([
            window.electron.invoice.getPayments(invoiceId),
            window.electron.invoice.getCreditNotes(invoiceId),
          ]);
          if (paymentsResp.success && paymentsResp.data) loadedPayments = paymentsResp.data;
          if (creditNotesResp.success && creditNotesResp.data) {
            loadedCreditNotes = creditNotesResp.data;
          }
        }
        if (cancelled) return;

        const date = (loaded.invoice_date || '').slice(0, 10);
        const due = (loaded.due_date || '').slice(0, 10);
        setCustomers(customerList);
        setInvoice(loaded);
        setPayments(loadedPayments);
        setCreditNotes(loadedCreditNotes);
        setOriginalInvoice(loadedOriginal);
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
    setLineItems((items) => [...items, emptyLine(defaultVatRate)]);
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
      result.invoiceDate = creditNote
        ? "La date de l'avoir est obligatoire."
        : 'La date de facture est obligatoire.';
    } else if (
      creditNote &&
      originalInvoice &&
      invoiceDate < originalInvoice.invoice_date.slice(0, 10)
    ) {
      result.invoiceDate = `La date de l'avoir ne peut pas précéder celle de la facture d'origine (${formatDate(
        originalInvoice.invoice_date
      )}).`;
    }
    if (!creditNote) {
      if (dueDate && invoiceDate && dueDate < invoiceDate) {
        result.dueDate = "La date d'échéance ne peut pas précéder la date de facture.";
      }
      const terms = Number(paymentTerms);
      if (paymentTerms.trim() === '' || !Number.isInteger(terms) || terms < 0) {
        result.paymentTerms = 'Indiquez un nombre de jours entier, positif ou nul.';
      }
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
        due_date: creditNote ? null : dueDate || null,
        buyer_id: customerId as number,
        seller_id: invoice?.seller_id ?? null,
        payment_terms_days: creditNote ? 0 : Number(paymentTerms),
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
        message:
          response.error ||
          (creditNote
            ? "L'enregistrement de l'avoir a échoué."
            : "L'enregistrement de la facture a échoué."),
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
            (creditNote
              ? "\nL'avoir a été enregistré comme brouillon."
              : '\nLa facture a été enregistrée comme brouillon.'),
        });
        // The draft now exists: continue on its own page
        if (invoiceId === null) navigate(`/invoices/${savedId}`, { replace: true });
        return;
      }
      // Show the issued invoice (read-only, with its number and export buttons)
      if (invoiceId === savedId) {
        const refreshed = await window.electron.invoice.get(savedId);
        if (refreshed.success && refreshed.data) setInvoice(refreshed.data);
        setFeedback({
          type: 'success',
          message: creditNote
            ? "Avoir émis : le solde de la facture d'origine a été mis à jour."
            : 'Facture finalisée.',
        });
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

  // ------------------------------------------- payments and credit notes

  /** Reload what evolves on an issued invoice: settlement state, payments, credit notes. */
  const refreshIssued = async () => {
    if (invoiceId === null) return;
    const [invoiceResp, paymentsResp, creditNotesResp] = await Promise.all([
      window.electron.invoice.get(invoiceId),
      window.electron.invoice.getPayments(invoiceId),
      window.electron.invoice.getCreditNotes(invoiceId),
    ]);
    if (invoiceResp.success && invoiceResp.data) setInvoice(invoiceResp.data);
    if (paymentsResp.success && paymentsResp.data) setPayments(paymentsResp.data);
    if (creditNotesResp.success && creditNotesResp.data) setCreditNotes(creditNotesResp.data);
  };

  const handlePaymentRecorded = async (amount: number) => {
    setShowPaymentForm(false);
    await refreshIssued();
    setFeedback({ type: 'success', message: `Paiement de ${formatAmount(amount)} enregistré.` });
  };

  const handleDeletePayment = async (paymentId: number) => {
    setBusy(true);
    setConfirmDeletePayment(null);
    setFeedback(null);
    try {
      const response = await window.electron.invoice.deletePayment(paymentId);
      await refreshIssued();
      setFeedback(
        response.success
          ? { type: 'success', message: 'Paiement supprimé : le solde de la facture a été rétabli.' }
          : { type: 'error', message: response.error || 'La suppression du paiement a échoué.' }
      );
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'La suppression du paiement a échoué.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleMarkSent = async () => {
    if (invoiceId === null) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await window.electron.invoice.markSent(invoiceId);
      const refreshed = await window.electron.invoice.get(invoiceId);
      if (refreshed.success && refreshed.data) setInvoice(refreshed.data);
      setFeedback(
        response.success
          ? {
              type: 'success',
              message: creditNote ? 'Avoir marqué comme envoyé.' : 'Facture marquée comme envoyée.',
            }
          : { type: 'error', message: response.error || "L'opération a échoué." }
      );
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : "L'opération a échoué.",
      });
    } finally {
      setBusy(false);
    }
  };

  /** Create (or reopen) the draft credit note of this invoice and open it. */
  const handleCreateCreditNote = async () => {
    if (invoiceId === null) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await window.electron.invoice.createCreditNote(invoiceId);
      if (response.success && response.data) {
        navigate(`/invoices/${response.data}`);
      } else {
        setFeedback({
          type: 'error',
          message: response.error || "La création de l'avoir a échoué.",
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : "La création de l'avoir a échoué.",
      });
    } finally {
      setBusy(false);
    }
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
    ? `${creditNote ? 'Avoir' : 'Facture'} ${invoice?.invoice_number ?? ''}`
    : creditNote
    ? 'Avoir (brouillon)'
    : 'Modifier le brouillon';

  const lastPayment = payments[0];

  // Settlement of an issued invoice
  const issuedInvoice = readOnly && invoice && !creditNote ? invoice : null;
  const balance = issuedInvoice ? balanceDue(issuedInvoice) : 0;
  const overpaid = issuedInvoice ? overpaidAmount(issuedInvoice) : 0;
  const credited = issuedInvoice?.credited_amount || 0;
  const canPay = issuedInvoice !== null && issuedInvoice.status !== 'cancelled' && balance > 0;
  const canCredit = issuedInvoice !== null && creditableAmount(issuedInvoice) > 0;
  const draftCreditNote = creditNotes.find((cn) => cn.status === 'draft');

  // Draft credit note: what can still be credited on the original invoice
  const creditLimit =
    creditNote && !readOnly && originalInvoice ? creditableAmount(originalInvoice) : null;
  const exceedsCreditLimit = creditLimit !== null && totals.total_amount > creditLimit;

  return (
    <div className="p-6" ref={topRef}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            {title}
            {invoice && <TypeBadge invoiceType={invoice.invoice_type} />}
            {invoice && (
              <StatusBadge
                status={invoice.status}
                paymentStatus={invoice.payment_status}
                invoiceType={invoice.invoice_type}
              />
            )}
          </h1>
          <p className="text-gray-600 mt-1">
            {!isEdit && 'Créer une nouvelle facture (brouillon)'}
            {isEdit &&
              !readOnly &&
              !creditNote &&
              "Le brouillon reste modifiable tant qu'il n'est pas finalisé."}
            {isEdit &&
              !readOnly &&
              creditNote &&
              "Par défaut, l'avoir annule toute la facture. Pour un avoir partiel, réduisez les quantités ou supprimez des lignes avant de l'émettre."}
            {readOnly &&
              !creditNote &&
              "Cette facture a été émise : elle n'est plus modifiable. Pour la corriger ou l'annuler, émettez une facture d'avoir."}
            {readOnly && creditNote && "Cet avoir a été émis : il n'est plus modifiable."}
          </p>
          {creditNote && originalInvoice && (
            <p className="text-gray-800 mt-2">
              Avoir sur la facture{' '}
              <Link
                to={`/invoices/${originalInvoice.id}`}
                className="text-blue-600 hover:underline font-medium"
              >
                {originalInvoice.invoice_number}
              </Link>{' '}
              du {formatDate(originalInvoice.invoice_date)} (
              {formatAmount(originalInvoice.total_amount)} TTC)
            </p>
          )}
        </div>
        {readOnly && invoice?.id !== undefined && (
          <div className="flex flex-wrap justify-end items-center gap-2">
            {invoice.status === 'finalized' && (
              <button
                type="button"
                className="px-4 py-2 border border-purple-400 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                disabled={busy}
                onClick={handleMarkSent}
              >
                {creditNote ? 'Marquer envoyé' : 'Marquer envoyée'}
              </button>
            )}
            {canPay && (
              <button
                type="button"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={busy || showPaymentForm}
                onClick={() => setShowPaymentForm(true)}
              >
                Enregistrer un paiement
              </button>
            )}
            {canCredit && (
              <button
                type="button"
                className="px-4 py-2 border border-orange-400 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
                disabled={busy}
                onClick={handleCreateCreditNote}
              >
                {draftCreditNote ? "Reprendre l'avoir en brouillon" : 'Créer un avoir'}
              </button>
            )}
            <InvoiceExportButtons invoiceId={invoice.id} onFeedback={setFeedback} variant="button" />
          </div>
        )}
      </div>

      <FeedbackBanner feedback={feedback} onClose={() => setFeedback(null)} />

      {/* Settlement of an issued invoice: balance, payments, credit notes */}
      {issuedInvoice && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Règlement</h2>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-gray-600">Total TTC</dt>
              <dd className="text-lg font-semibold text-gray-900">
                {formatAmount(issuedInvoice.total_amount)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Avoirs émis</dt>
              <dd className="text-lg font-semibold text-orange-700">
                {credited > 0 ? `− ${formatAmount(credited)}` : formatAmount(0)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Paiements reçus</dt>
              <dd className="text-lg font-semibold text-green-700">
                {formatAmount(issuedInvoice.paid_amount || 0)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">{overpaid > 0 ? 'À rembourser au client' : 'Reste dû'}</dt>
              <dd className="text-lg font-bold text-gray-900">
                {formatAmount(overpaid > 0 ? overpaid : balance)}
              </dd>
            </div>
          </dl>
          {issuedInvoice.status === 'cancelled' && (
            <p className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
              Cette facture a été intégralement annulée par avoir : plus rien n'est dû.
            </p>
          )}

          {showPaymentForm && canPay && (
            <div className="mt-4">
              <PaymentForm
                invoiceId={issuedInvoice.id as number}
                balance={balance}
                onRecorded={handlePaymentRecorded}
                onCancel={() => setShowPaymentForm(false)}
              />
            </div>
          )}

          <h3 className="font-semibold text-gray-900 mt-6 mb-2">Paiements</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun paiement enregistré.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Mode</th>
                  <th className="py-2 pr-4 font-medium">Référence</th>
                  <th className="py-2 pr-4 font-medium text-right">Montant</th>
                  <th className="py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(payment.payment_date)}</td>
                    <td className="py-2 pr-4">
                      {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
                    </td>
                    <td className="py-2 pr-4 text-gray-600 break-all">
                      {payment.payment_reference || '-'}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium whitespace-nowrap">
                      {formatAmount(payment.amount)}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {confirmDeletePayment === payment.id ? (
                        <span className="inline-flex items-center gap-3">
                          <span className="text-gray-700">Supprimer ce paiement ?</span>
                          <button
                            type="button"
                            className="text-red-600 hover:underline disabled:opacity-50"
                            disabled={busy}
                            onClick={() => handleDeletePayment(payment.id as number)}
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            className="text-gray-600 hover:underline"
                            onClick={() => setConfirmDeletePayment(null)}
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="text-red-600 hover:underline disabled:opacity-50"
                          disabled={busy}
                          title="Supprimer un paiement saisi par erreur"
                          onClick={() => setConfirmDeletePayment(payment.id as number)}
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {creditNotes.length > 0 && (
            <>
              <h3 className="font-semibold text-gray-900 mt-6 mb-2">Avoirs liés</h3>
              <ul className="divide-y divide-gray-100 text-sm">
                {creditNotes.map((cn) => (
                  <li key={cn.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      <Link
                        to={`/invoices/${cn.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {cn.status === 'draft' ? 'Avoir en brouillon' : cn.invoice_number}
                      </Link>
                      <span className="text-gray-600">{formatDate(cn.invoice_date)}</span>
                      <StatusBadge status={cn.status} invoiceType="credit_note" />
                    </span>
                    <span className="font-medium text-orange-700 whitespace-nowrap">
                      − {formatAmount(cn.total_amount)}
                      {cn.status === 'draft' && (
                        <span className="text-gray-500 font-normal"> (non émis, sans effet)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} noValidate>
          <fieldset disabled={readOnly || saving} className="space-y-6 min-w-0">
            {/* Invoice Info */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {creditNote ? "Informations de l'avoir" : 'Informations de la facture'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {creditNote ? "Numéro de l'avoir" : 'Numéro de facture'}
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
                      (numérotation continue{creditNote ? ', série AV propre aux avoirs' : ''}).
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="invoice-date">
                    {creditNote ? "Date de l'avoir *" : 'Date de facture *'}
                  </label>
                  <input
                    id="invoice-date"
                    type="date"
                    className={inputClass(Boolean(errors.invoiceDate))}
                    value={invoiceDate}
                    min={
                      creditNote && originalInvoice
                        ? originalInvoice.invoice_date.slice(0, 10)
                        : undefined
                    }
                    onChange={(e) => handleInvoiceDateChange(e.target.value)}
                  />
                  <FieldError message={errors.invoiceDate} />
                </div>
                {!creditNote && (
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
                )}
                {!creditNote && (
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
                )}
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
                  {!creditNote && (invoice.status === 'paid' || lastPayment) && (
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
                  {creditNote ? "Client (celui de la facture d'origine)" : 'Sélectionner un client *'}
                </label>
                <select
                  id="customer"
                  className={inputClass(Boolean(errors.customer))}
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value ? Number(e.target.value) : '');
                    setErrors((current) => ({ ...current, customer: undefined }));
                  }}
                  disabled={loadingCustomers || creditNote}
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
                    <span>{creditNote ? "Total TTC de l'avoir :" : 'Total TTC :'}</span>
                    <span>{formatAmount(shownTotals.total)}</span>
                  </div>
                  {creditLimit !== null && originalInvoice && (
                    <p
                      role={exceedsCreditLimit ? 'alert' : undefined}
                      className={`text-sm pt-2 ${
                        exceedsCreditLimit ? 'text-red-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      Montant restant à créditer sur la facture {originalInvoice.invoice_number} :{' '}
                      {formatAmount(creditLimit)}.
                      {exceedsCreditLimit &&
                        " L'avoir dépasse ce montant : réduisez les quantités ou supprimez des lignes."}
                    </p>
                  )}
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
                  {creditNote
                    ? "Émettre cet avoir ? Un numéro définitif sera attribué, il ne sera plus modifiable et le solde de la facture d'origine sera réduit."
                    : 'Finaliser ? Un numéro définitif sera attribué et la facture ne sera plus modifiable.'}
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
                  {creditNote ? "Enregistrer et émettre l'avoir" : 'Enregistrer et finaliser'}
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
