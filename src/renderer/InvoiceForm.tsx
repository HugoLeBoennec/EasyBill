/**
 * Invoice Form Component
 * Create and edit invoices
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const InvoiceForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // TODO: Implement invoice creation
      console.log('Creating invoice...');

      // Navigate back to invoices list
      navigate('/invoices');
    } catch (error) {
      console.error('Failed to create invoice:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/invoices');
  };

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
                    defaultValue={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date d'échéance
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Délai de paiement
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    defaultValue={30}
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
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">-- Choisir un client --</option>
                </select>
              </div>
            </div>

            {/* Placeholder for line items */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Articles / Services
              </h2>
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <p className="text-gray-600">
                  Formulaire détaillé en cours de développement...
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Cette fonctionnalité sera bientôt disponible
                </p>
              </div>
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
