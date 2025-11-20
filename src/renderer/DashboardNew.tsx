/**
 * Enhanced Dashboard
 *
 * Shows real statistics from the database
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Stats {
  total_invoices: number;
  draft_invoices: number;
  finalized_invoices: number;
  total_parties: number;
  total_customers: number;
  pending_einvoices: number;
  failed_transmissions: number;
}

interface ComplianceStats {
  total: number;
  compliant: number;
  non_compliant: number;
  pending: number;
}

const DashboardNew = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [compliance, setCompliance] = useState<ComplianceStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);

    try {
      // Load database stats
      const statsResp = await window.electron.database.getStats();
      if (statsResp.success) {
        setStats(statsResp.data);
      }

      // Load compliance stats
      const complianceResp = await window.electron.einvoice.getComplianceStats();
      if (complianceResp.success) {
        setCompliance(complianceResp.data);
      }

      // Load recent invoices
      const recentResp = await window.electron.invoice.getRecent(5);
      if (recentResp.success) {
        setRecentInvoices(recentResp.data);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Chargement du tableau de bord...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-600 mt-1">Vue d'ensemble de votre activité</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Factures totales</p>
              <p className="text-3xl font-bold mt-2">{stats?.total_invoices || 0}</p>
            </div>
            <div className="bg-blue-400 bg-opacity-30 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path
                  fillRule="evenodd"
                  d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Factures finalisées</p>
              <p className="text-3xl font-bold mt-2">{stats?.finalized_invoices || 0}</p>
            </div>
            <div className="bg-green-400 bg-opacity-30 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">Clients</p>
              <p className="text-3xl font-bold mt-2">{stats?.total_customers || 0}</p>
            </div>
            <div className="bg-purple-400 bg-opacity-30 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium">Brouillons</p>
              <p className="text-3xl font-bold mt-2">{stats?.draft_invoices || 0}</p>
            </div>
            <div className="bg-orange-400 bg-opacity-30 rounded-full p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* E-Invoicing Compliance */}
      {compliance && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Conformité E-Invoicing
          </h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900">{compliance.total}</div>
              <div className="text-sm text-gray-600 mt-1">Total</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{compliance.compliant}</div>
              <div className="text-sm text-gray-600 mt-1">Conformes</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{compliance.non_compliant}</div>
              <div className="text-sm text-gray-600 mt-1">Non conformes</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">{compliance.pending}</div>
              <div className="text-sm text-gray-600 mt-1">En attente</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Invoices & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Factures récentes</h2>
            <Link to="/invoices" className="text-blue-600 hover:underline text-sm">
              Voir tout
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucune facture</p>
          ) : (
            <div className="space-y-3">
              {recentInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <Link
                      to={`/invoices/${invoice.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {invoice.invoice_number}
                    </Link>
                    <div className="text-sm text-gray-600">
                      {formatDate(invoice.invoice_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">
                      {formatAmount(invoice.total_amount)}
                    </div>
                    <div className="text-xs text-gray-500">{invoice.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
          <div className="space-y-3">
            <Link
              to="/invoices/new"
              className="block w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
            >
              + Nouvelle facture
            </Link>
            <Link
              to="/customers"
              className="block w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-center font-medium"
            >
              👥 Gérer les clients
            </Link>
            <Link
              to="/setting/einvoicing"
              className="block w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-center font-medium"
            >
              ⚙️ Configuration E-Invoicing
            </Link>
          </div>

          {/* Warnings */}
          {(stats?.pending_einvoices || 0) > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <svg
                  className="w-5 h-5 text-yellow-600 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-yellow-800 text-sm font-medium">
                  {stats.pending_einvoices} e-facture(s) en attente d'envoi
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardNew;
