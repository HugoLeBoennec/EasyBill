/**
 * Invoices Component
 *
 * List and manage invoices
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Invoice, InvoiceComplete } from '../database/types';

const Invoices = () => {
  const [invoices, setInvoices] = useState<InvoiceComplete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all'); // all, draft, finalized, sent, paid

  useEffect(() => {
    loadInvoices();
  }, [filter]);

  const loadInvoices = async () => {
    setLoading(true);
    setError(null);

    try {
      const filterObj = filter === 'all' ? {} : { status: filter };
      const response = await window.electron.invoice.list(filterObj);

      if (response.success && response.data) {
        // Load complete invoice data for each
        const completeInvoices = await Promise.all(
          response.data.invoices.map(async (inv) => {
            const completeResp = await window.electron.invoice.getComplete(inv.id!);
            return completeResp.data || inv;
          })
        );
        setInvoices(completeInvoices);
      } else {
        setError(response.error || 'Failed to load invoices');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number): string => {
    return `€${(amount / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      draft: 'bg-gray-200 text-gray-800',
      finalized: 'bg-blue-200 text-blue-800',
      sent: 'bg-purple-200 text-purple-800',
      paid: 'bg-green-200 text-green-800',
      cancelled: 'bg-red-200 text-red-800',
    };

    return (
      <span
        className={`px-2 py-1 text-xs font-semibold rounded-full ${
          statusStyles[status] || 'bg-gray-200 text-gray-800'
        }`}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette facture ?')) {
      return;
    }

    const response = await window.electron.invoice.delete(id);
    if (response.success) {
      loadInvoices();
    } else {
      alert('Erreur: ' + response.error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

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
        {['all', 'draft', 'finalized', 'sent', 'paid'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {status === 'all' ? 'Toutes' : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Invoice Table */}
      {invoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">Aucune facture trouvée</p>
          <Link
            to="/invoices/new"
            className="text-blue-600 hover:underline mt-2 inline-block"
          >
            Créer votre première facture
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
                  Montant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  E-Invoicing
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/invoices/${invoice.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {invoice.buyer_name || 'N/A'}
                    </div>
                    {invoice.buyer_siret && (
                      <div className="text-sm text-gray-500">
                        SIRET: {invoice.buyer_siret}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatAmount(invoice.total_amount)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Payé: {formatAmount(invoice.paid_amount || 0)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(invoice.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {invoice.einvoice_status ? (
                      <span className="text-xs text-gray-600">
                        {invoice.einvoice_status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      to={`/invoices/${invoice.id}/edit`}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      Modifier
                    </Link>
                    {invoice.status === 'draft' && (
                      <button
                        onClick={() => handleDelete(invoice.id!)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Total factures</div>
          <div className="text-2xl font-bold text-gray-900">{invoices.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Montant total</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatAmount(
              invoices.reduce((sum, inv) => sum + inv.total_amount, 0)
            )}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Montant payé</div>
          <div className="text-2xl font-bold text-green-600">
            {formatAmount(
              invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)
            )}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">Reste à payer</div>
          <div className="text-2xl font-bold text-orange-600">
            {formatAmount(
              invoices.reduce(
                (sum, inv) => sum + (inv.total_amount - (inv.paid_amount || 0)),
                0
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Invoices;
