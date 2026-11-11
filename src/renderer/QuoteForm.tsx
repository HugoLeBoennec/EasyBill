/**
 * Quote Form Component
 *
 * Create (quotes/new) and edit (quotes/:id) a quote (devis).
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Party, QuoteLineInput, QuoteStatus } from '../database/types';

interface LineItem {
  key: string;
  item_name: string;
  item_description: string;
  // Kept as typed text so partial input ("1,", "") is not rewritten while typing
  quantity: string;
  unit_price: string;
  vat_rate: number;
}

interface LineErrors {
  item_name?: string;
  quantity?: string;
  unit_price?: string;
}

interface FormErrors {
  customer?: string;
  quoteDate?: string;
  validUntil?: string;
  lines?: string;
  lineItems: Record<string, LineErrors>;
}

const VAT_RATES = [0, 2.1, 5.5, 10, 20];
const DEFAULT_VALIDITY_DAYS = 30;

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
  converted: 'Facturé',
};

const amountFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});
const formatAmount = (cents: number) => amountFormatter.format(cents / 100);

/** Local date as YYYY-MM-DD (toISOString() would shift to UTC) */
const toISODate = (date: Date): string => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
};

const addDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  return toISODate(new Date(y, m - 1, d + days));
};

/** Parse a user-typed number, accepting the French decimal comma */
const parseNumber = (value: string): number => {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return NaN;
  return Number(normalized);
};

let lineCounter = 0;
const newLine = (): LineItem => ({
  key: `line-${Date.now()}-${lineCounter++}`,
  item_name: '',
  item_description: '',
  quantity: '1',
  unit_price: '',
  vat_rate: 20,
});

/** Round half away from zero after removing binary noise (as the repository does) */
const roundHalfUp = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.sign(value) * Math.round(Number(Math.abs(value).toPrecision(12)));
};

/** Net amount of a line in cents (quantity x unit price) */
const computeLineTotal = (item: LineItem): number => {
  const quantity = parseNumber(item.quantity);
  const unitPrice = parseNumber(item.unit_price);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  return roundHalfUp(quantity * roundHalfUp(unitPrice * 100));
};

/**
 * Totals in cents, computed like the repository: HT is the sum of the lines,
 * VAT is rounded once per rate on the total base of that rate.
 */
const computeTotals = (items: LineItem[]) => {
  const baseByRate = new Map<number, number>();
  for (const item of items) {
    baseByRate.set(
      item.vat_rate,
      (baseByRate.get(item.vat_rate) || 0) + computeLineTotal(item)
    );
  }
  let subtotal = 0;
  let taxAmount = 0;
  baseByRate.forEach((base, rate) => {
    subtotal += base;
    taxAmount += roundHalfUp((base * rate) / 100);
  });
  return { subtotal, taxAmount };
};

const inputClass = (hasError?: boolean) =>
  `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-600 ${
    hasError ? 'border-red-500' : 'border-gray-300'
  }`;

const FieldError = ({ id, message }: { id?: string; message?: string }) =>
  message ? (
    <p id={id} className="text-xs text-red-600 mt-1">
      {message}
    </p>
  ) : null;

const QuoteForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const quoteId = id ? Number(id) : null;
  const isEdit = quoteId !== null;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Form fields
  const today = toISODate(new Date());
  const [quoteNumber, setQuoteNumber] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('draft');
  const [quoteDate, setQuoteDate] = useState(today);
  const [validUntil, setValidUntil] = useState(
    addDays(today, DEFAULT_VALIDITY_DAYS)
  );
  // Until the user edits the validity date, it follows the issue date
  const [validityTouched, setValidityTouched] = useState(isEdit);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [customerReference, setCustomerReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>(() =>
    isEdit ? [] : [newLine()]
  );
  const [errors, setErrors] = useState<FormErrors>({ lineItems: {} });

  const readOnly = status === 'converted';

  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const response = await window.electron.party.getCustomers(true);
        if (response.success && response.data) {
          setCustomers(response.data);
        }
      } catch (error) {
        console.error('Failed to load customers:', error);
      } finally {
        setLoadingCustomers(false);
      }
    };
    loadCustomers();
  }, []);

  useEffect(() => {
    if (quoteId === null) {
      // Preview of the number the quote will most likely receive
      window.electron.quote
        .getNextNumber()
        .then((resp) => {
          if (resp.success && resp.data) setQuoteNumber(resp.data);
        })
        .catch(() => undefined);
      return;
    }

    if (!Number.isInteger(quoteId)) {
      setLoadError('Devis introuvable');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadQuote = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await window.electron.quote.getWithLines(quoteId);
        if (cancelled) return;
        if (!response.success || !response.data) {
          setLoadError(response.error || 'Devis introuvable');
          return;
        }
        const { quote, lines } = response.data;
        setQuoteNumber(quote.quote_number);
        setStatus(quote.status);
        setQuoteDate(quote.quote_date);
        setValidUntil(quote.valid_until || '');
        setCustomerId(quote.customer_id ?? '');
        setCustomerReference(quote.customer_reference || '');
        setNotes(quote.notes || '');
        setLineItems(
          lines.map((line) => ({
            key: `line-db-${line.id}`,
            item_name: line.item_name,
            item_description: line.item_description || '',
            quantity: String(line.quantity),
            unit_price: (line.unit_price / 100).toFixed(2),
            vat_rate: line.vat_rate,
          }))
        );
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadQuote();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  const handleQuoteDateChange = (value: string) => {
    setQuoteDate(value);
    if (!validityTouched && value) {
      setValidUntil(addDays(value, DEFAULT_VALIDITY_DAYS));
    }
  };

  const addLineItem = () => {
    setLineItems((items) => [...items, newLine()]);
    setErrors((prev) => ({ ...prev, lines: undefined }));
  };

  const removeLineItem = (key: string) => {
    setLineItems((items) => items.filter((item) => item.key !== key));
  };

  const updateLineItem = <K extends keyof LineItem>(
    key: string,
    field: K,
    value: LineItem[K]
  ) => {
    setLineItems((items) =>
      items.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
    // Clear the message of the field being corrected
    setErrors((prev) => {
      const lineErrors = prev.lineItems[key];
      if (!lineErrors || !(field in lineErrors)) return prev;
      return {
        ...prev,
        lineItems: {
          ...prev.lineItems,
          [key]: { ...lineErrors, [field]: undefined },
        },
      };
    });
  };

  const totals = computeTotals(lineItems);

  const validate = (): FormErrors => {
    const next: FormErrors = { lineItems: {} };

    if (!customerId) next.customer = 'Veuillez sélectionner un client';
    if (!quoteDate) next.quoteDate = "La date d'émission est obligatoire";
    if (!validUntil) {
      next.validUntil = 'La date de validité est obligatoire';
    } else if (quoteDate && validUntil < quoteDate) {
      next.validUntil =
        "La date de validité doit être postérieure à la date d'émission";
    }
    if (lineItems.length === 0) {
      next.lines = 'Ajoutez au moins une ligne au devis';
    }

    for (const item of lineItems) {
      const lineErrors: LineErrors = {};
      if (!item.item_name.trim()) {
        lineErrors.item_name = 'La désignation est obligatoire';
      }
      const quantity = parseNumber(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        lineErrors.quantity = 'Quantité supérieure à 0 requise';
      }
      const unitPrice = parseNumber(item.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        lineErrors.unit_price = 'Prix unitaire requis (0 ou plus)';
      }
      if (Object.keys(lineErrors).length > 0) {
        next.lineItems[item.key] = lineErrors;
      }
    }

    return next;
  };

  const hasErrors = (e: FormErrors) =>
    !!(e.customer || e.quoteDate || e.validUntil || e.lines) ||
    Object.values(e.lineItems).some((line) =>
      Object.values(line).some(Boolean)
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    setSubmitError(null);
    const validation = validate();
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSaving(true);
    try {
      const header = {
        quote_date: quoteDate,
        valid_until: validUntil,
        customer_id: customerId as number,
        notes: notes.trim() || undefined,
        customer_reference: customerReference.trim() || undefined,
      };
      const lines: QuoteLineInput[] = lineItems.map((item) => ({
        item_name: item.item_name.trim(),
        item_description: item.item_description.trim() || undefined,
        quantity: parseNumber(item.quantity),
        unit_price: roundHalfUp(parseNumber(item.unit_price) * 100),
        vat_rate: item.vat_rate,
      }));

      const response =
        quoteId !== null
          ? await window.electron.quote.updateWithLines(quoteId, header, lines)
          : await window.electron.quote.createWithLines(header, lines);

      if (!response.success) {
        throw new Error(response.error || "Impossible d'enregistrer le devis");
      }

      navigate('/quotes');
    } catch (error: any) {
      console.error('Failed to save quote:', error);
      setSubmitError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6">
        <div
          role="alert"
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
        >
          {loadError}
        </div>
        <Link to="/quotes" className="text-blue-600 hover:underline">
          Retour aux devis
        </Link>
      </div>
    );
  }

  const vatOptions = (rate: number) =>
    VAT_RATES.includes(rate) ? VAT_RATES : [...VAT_RATES, rate].sort((a, b) => a - b);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {isEdit ? `Devis ${quoteNumber}` : 'Nouveau devis'}
        </h1>
        <p className="text-gray-600 mt-1">
          {!isEdit
            ? 'Créer un nouveau devis'
            : readOnly
              ? 'Ce devis a été converti en facture : il est en lecture seule'
              : `Modifier le devis — statut : ${STATUS_LABELS[status]}`}
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} noValidate>
          <fieldset disabled={readOnly || saving} className="space-y-6">
            {/* Quote Info */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Informations du devis
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="quote-number"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Numéro de devis
                  </label>
                  <input
                    id="quote-number"
                    type="text"
                    className={inputClass()}
                    value={quoteNumber}
                    disabled
                    readOnly
                  />
                  {!isEdit && (
                    <p className="text-xs text-gray-500 mt-1">
                      Auto-généré à l'enregistrement
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="quote-customer-ref"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Référence client (optionnel)
                  </label>
                  <input
                    id="quote-customer-ref"
                    type="text"
                    className={inputClass()}
                    value={customerReference}
                    onChange={(e) => setCustomerReference(e.target.value)}
                    placeholder="Référence ou bon de commande du client"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quote-date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Date d'émission *
                  </label>
                  <input
                    id="quote-date"
                    type="date"
                    className={inputClass(!!errors.quoteDate)}
                    value={quoteDate}
                    onChange={(e) => handleQuoteDateChange(e.target.value)}
                    aria-invalid={!!errors.quoteDate}
                    aria-describedby="quote-date-error"
                  />
                  <FieldError id="quote-date-error" message={errors.quoteDate} />
                </div>
                <div>
                  <label
                    htmlFor="quote-valid-until"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Valable jusqu'au *
                  </label>
                  <input
                    id="quote-valid-until"
                    type="date"
                    className={inputClass(!!errors.validUntil)}
                    value={validUntil}
                    min={quoteDate || undefined}
                    onChange={(e) => {
                      setValidityTouched(true);
                      setValidUntil(e.target.value);
                    }}
                    aria-invalid={!!errors.validUntil}
                    aria-describedby="quote-valid-until-error"
                  />
                  <FieldError
                    id="quote-valid-until-error"
                    message={errors.validUntil}
                  />
                </div>
              </div>
            </div>

            {/* Customer Selection */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Client</h2>
              <div>
                <label
                  htmlFor="quote-customer"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Sélectionner un client *
                </label>
                <select
                  id="quote-customer"
                  className={inputClass(!!errors.customer)}
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value ? Number(e.target.value) : '');
                    setErrors((prev) => ({ ...prev, customer: undefined }));
                  }}
                  disabled={loadingCustomers}
                  aria-invalid={!!errors.customer}
                  aria-describedby="quote-customer-error"
                >
                  <option value="">-- Choisir un client --</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.legal_name}
                      {customer.siret && ` (SIRET: ${customer.siret})`}
                    </option>
                  ))}
                </select>
                <FieldError id="quote-customer-error" message={errors.customer} />
                {loadingCustomers && (
                  <p className="text-xs text-gray-500 mt-1">
                    Chargement des clients...
                  </p>
                )}
                {!loadingCustomers && customers.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Aucun client enregistré.{' '}
                    <Link to="/customers" className="text-blue-600 hover:underline">
                      Créer un client
                    </Link>
                  </p>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Articles / Services
                </h2>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    + Ajouter une ligne
                  </button>
                )}
              </div>

              {lineItems.length === 0 ? (
                <div
                  className={`bg-gray-50 rounded-lg p-8 text-center border ${
                    errors.lines ? 'border-red-500' : 'border-transparent'
                  }`}
                >
                  <p className="text-gray-600">Aucune ligne ajoutée</p>
                  <FieldError message={errors.lines} />
                </div>
              ) : (
                <div className="space-y-4">
                  {lineItems.map((item, index) => {
                    const lineErrors = errors.lineItems[item.key] || {};
                    const lineTotal = computeLineTotal(item);
                    return (
                      <div
                        key={item.key}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-medium text-gray-900">
                            Ligne {index + 1}
                          </h3>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div className="lg:col-span-2">
                            <label
                              htmlFor={`${item.key}-name`}
                              className="block text-xs font-medium text-gray-700 mb-1"
                            >
                              Désignation *
                            </label>
                            <input
                              id={`${item.key}-name`}
                              type="text"
                              className={`${inputClass(!!lineErrors.item_name)} text-sm`}
                              value={item.item_name}
                              onChange={(e) =>
                                updateLineItem(item.key, 'item_name', e.target.value)
                              }
                              placeholder="Nom du produit/service"
                              aria-invalid={!!lineErrors.item_name}
                            />
                            <FieldError message={lineErrors.item_name} />
                          </div>
                          <div>
                            <label
                              htmlFor={`${item.key}-qty`}
                              className="block text-xs font-medium text-gray-700 mb-1"
                            >
                              Quantité *
                            </label>
                            <input
                              id={`${item.key}-qty`}
                              type="text"
                              inputMode="decimal"
                              className={`${inputClass(!!lineErrors.quantity)} text-sm`}
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(item.key, 'quantity', e.target.value)
                              }
                              aria-invalid={!!lineErrors.quantity}
                            />
                            <FieldError message={lineErrors.quantity} />
                          </div>
                          <div>
                            <label
                              htmlFor={`${item.key}-price`}
                              className="block text-xs font-medium text-gray-700 mb-1"
                            >
                              Prix unitaire HT (€) *
                            </label>
                            <input
                              id={`${item.key}-price`}
                              type="text"
                              inputMode="decimal"
                              className={`${inputClass(!!lineErrors.unit_price)} text-sm`}
                              value={item.unit_price}
                              onChange={(e) =>
                                updateLineItem(item.key, 'unit_price', e.target.value)
                              }
                              placeholder="0,00"
                              aria-invalid={!!lineErrors.unit_price}
                            />
                            <FieldError message={lineErrors.unit_price} />
                          </div>
                          <div>
                            <label
                              htmlFor={`${item.key}-vat`}
                              className="block text-xs font-medium text-gray-700 mb-1"
                            >
                              TVA (%)
                            </label>
                            <select
                              id={`${item.key}-vat`}
                              className={`${inputClass()} text-sm`}
                              value={item.vat_rate}
                              onChange={(e) =>
                                updateLineItem(
                                  item.key,
                                  'vat_rate',
                                  Number(e.target.value)
                                )
                              }
                            >
                              {vatOptions(item.vat_rate).map((rate) => (
                                <option key={rate} value={rate}>
                                  {String(rate).replace('.', ',')} %
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="lg:col-span-4">
                            <label
                              htmlFor={`${item.key}-desc`}
                              className="block text-xs font-medium text-gray-700 mb-1"
                            >
                              Description
                            </label>
                            <input
                              id={`${item.key}-desc`}
                              type="text"
                              className={`${inputClass()} text-sm`}
                              value={item.item_description}
                              onChange={(e) =>
                                updateLineItem(
                                  item.key,
                                  'item_description',
                                  e.target.value
                                )
                              }
                              placeholder="Description optionnelle"
                            />
                          </div>
                          <div>
                            <div className="block text-xs font-medium text-gray-700 mb-1">
                              Total HT
                            </div>
                            <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium text-right">
                              {formatAmount(lineTotal)}
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
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h3 className="font-semibold text-gray-900 mb-4">Récapitulatif</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-700">
                  <span>Total HT :</span>
                  <span className="font-medium">{formatAmount(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>TVA :</span>
                  <span className="font-medium">
                    {formatAmount(totals.taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-blue-300">
                  <span>Total TTC :</span>
                  <span>{formatAmount(totals.subtotal + totals.taxAmount)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="quote-notes"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Notes (optionnel)
              </label>
              <textarea
                id="quote-notes"
                className={inputClass()}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conditions, délais de réalisation, remarques..."
              />
            </div>
          </fieldset>

          {/* Submit error */}
          {submitError && (
            <div
              role="alert"
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mt-6"
            >
              {submitError}
            </div>
          )}
          {hasErrors(errors) && (
            <p role="alert" className="text-sm text-red-600 mt-6">
              Certains champs sont à corriger avant d'enregistrer le devis.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t">
            <button
              type="button"
              onClick={() => navigate('/quotes')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={saving}
            >
              {readOnly ? 'Retour' : 'Annuler'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={saving}
              >
                {saving
                  ? 'Enregistrement...'
                  : isEdit
                    ? 'Enregistrer le devis'
                    : 'Créer le devis'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuoteForm;
