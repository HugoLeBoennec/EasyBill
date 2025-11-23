/**
 * Invoice Form Component
 * Create and edit invoices
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Customer {
  id: number;
  legal_name: string;
  siret?: string;
  email?: string;
}

interface LineItem {
  id: string;
  item_name: string;
  item_description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  line_total: number;
}

const InvoiceForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Form fields
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    // Auto-calculate due date based on invoice date and payment terms
    if (invoiceDate && paymentTerms) {
      const date = new Date(invoiceDate);
      date.setDate(date.getDate() + paymentTerms);
      setDueDate(date.toISOString().split('T')[0]);
    }
  }, [invoiceDate, paymentTerms]);

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

  const addLineItem = () => {
    const newItem: LineItem = {
      id: Date.now().toString(),
      item_name: '',
      item_description: '',
      quantity: 1,
      unit_price: 0,
      vat_rate: 20,
      line_total: 0,
    };
    setLineItems([...lineItems, newItem]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Recalculate line total
          if (field === 'quantity' || field === 'unit_price') {
            updated.line_total = updated.quantity * updated.unit_price;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    const taxAmount = lineItems.reduce(
      (sum, item) => sum + (item.line_total * item.vat_rate) / 100,
      0
    );
    const total = subtotal + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100), // Convert to cents
      taxAmount: Math.round(taxAmount * 100),
      total: Math.round(total * 100),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      alert('Veuillez sélectionner un client');
      return;
    }

    if (lineItems.length === 0) {
      alert('Veuillez ajouter au moins un article');
      return;
    }

    setLoading(true);

    try {
      const totals = calculateTotals();

      // Get next invoice number
      const numberResp = await window.electron.invoice.getNextNumber('INV');
      if (!numberResp.success) {
        throw new Error('Failed to get invoice number');
      }

      // Create invoice
      const invoiceData = {
        invoice_number: numberResp.data,
        invoice_date: invoiceDate,
        due_date: dueDate,
        invoice_type: 'invoice' as const,
        subtotal_amount: totals.subtotal,
        tax_amount: totals.taxAmount,
        total_amount: totals.total,
        paid_amount: 0,
        currency: 'EUR',
        seller_id: 1, // Your company
        buyer_id: customerId as number,
        status: 'draft' as const,
        payment_status: 'unpaid' as const,
        payment_terms_days: paymentTerms,
        notes: notes || undefined,
      };

      const invoiceResp = await window.electron.invoice.create(invoiceData);
      if (!invoiceResp.success || !invoiceResp.data) {
        throw new Error(invoiceResp.error || 'Failed to create invoice');
      }

      const invoiceId = invoiceResp.data;

      // Create line items
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const lineData = {
          invoice_id: invoiceId,
          line_number: i + 1,
          item_name: item.item_name,
          item_description: item.item_description || undefined,
          quantity: item.quantity,
          unit_code: 'C62',
          unit_price: Math.round(item.unit_price * 100),
          line_amount: Math.round(item.line_total * 100),
          discount_amount: 0,
          line_total: Math.round(item.line_total * 100),
          vat_category: 'S',
          vat_rate: item.vat_rate,
          vat_amount: Math.round((item.line_total * item.vat_rate) / 100 * 100),
        };

        await window.electron.invoice.createLine(lineData);
      }

      // Navigate back to invoices list
      navigate('/invoices');
    } catch (error: any) {
      console.error('Failed to create invoice:', error);
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/invoices');
  };

  const totals = calculateTotals();
  const formatAmount = (cents: number) => `€${(cents / 100).toFixed(2)}`;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Nouvelle facture</h1>
        <p className="text-gray-600 mt-1">Créer une nouvelle facture</p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="INV-2025-001"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">Auto-généré</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de facture
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date d'échéance
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Délai de paiement
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(Number(e.target.value))}
                    min={0}
                  />
                  <p className="text-xs text-gray-500 mt-1">Jours</p>
                </div>
              </div>
            </div>

            {/* Customer Selection */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Client</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sélectionner un client
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                  disabled={loadingCustomers}
                  required
                >
                  <option value="">-- Choisir un client --</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.legal_name}
                      {customer.siret && ` (SIRET: ${customer.siret})`}
                    </option>
                  ))}
                </select>
                {loadingCustomers && (
                  <p className="text-xs text-gray-500 mt-1">Chargement des clients...</p>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Articles / Services</h2>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  + Ajouter une ligne
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <p className="text-gray-600">Aucun article ajouté</p>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="mt-3 text-blue-600 hover:underline text-sm"
                  >
                    Ajouter votre premier article
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {lineItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-medium text-gray-900">Ligne {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Supprimer
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Désignation *
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            value={item.item_name}
                            onChange={(e) =>
                              updateLineItem(item.id, 'item_name', e.target.value)
                            }
                            placeholder="Nom du produit/service"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Quantité *
                          </label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(item.id, 'quantity', Number(e.target.value))
                            }
                            min="0"
                            step="0.01"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Prix unitaire HT (€) *
                          </label>
                          <input
                            type="number"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            value={item.unit_price}
                            onChange={(e) =>
                              updateLineItem(item.id, 'unit_price', Number(e.target.value))
                            }
                            min="0"
                            step="0.01"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            TVA (%)
                          </label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            value={item.vat_rate}
                            onChange={(e) =>
                              updateLineItem(item.id, 'vat_rate', Number(e.target.value))
                            }
                          >
                            <option value="0">0%</option>
                            <option value="5.5">5.5%</option>
                            <option value="10">10%</option>
                            <option value="20">20%</option>
                          </select>
                        </div>
                        <div className="lg:col-span-3">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            value={item.item_description}
                            onChange={(e) =>
                              updateLineItem(item.id, 'item_description', e.target.value)
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
                              €{item.line_total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            {lineItems.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-4">Récapitulatif</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-gray-700">
                    <span>Sous-total HT:</span>
                    <span className="font-medium">{formatAmount(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>TVA:</span>
                    <span className="font-medium">{formatAmount(totals.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-blue-300">
                    <span>Total TTC:</span>
                    <span>{formatAmount(totals.total)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optionnel)
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Conditions de paiement, remarques..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Création...' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvoiceForm;
