/**
 * Customers Component
 *
 * Manage customers (parties)
 */

import { useState, useEffect } from 'react';
import type { Party } from '../database/types';

const Customers = () => {
  const [customers, setCustomers] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState<Partial<Party>>({
    party_type: 'customer',
    legal_name: '',
    trading_name: '',
    legal_form: '',
    siret: '',
    vat_number: '',
    address_line1: '',
    postal_code: '',
    city: '',
    country_code: 'FR',
    email: '',
    phone: '',
    active: 1,
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await window.electron.party.getCustomers(true);
      if (response.success && response.data) {
        setCustomers(response.data);
      } else {
        setError(response.error || 'Failed to load customers');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (editingId) {
        // Update
        const response = await window.electron.party.update(editingId, formData);
        if (!response.success) {
          setError(response.error || 'Failed to update customer');
          return;
        }
      } else {
        // Create
        const response = await window.electron.party.create(formData as any);
        if (!response.success) {
          setError(response.error || 'Failed to create customer');
          return;
        }
      }

      // Reset form
      setShowForm(false);
      setEditingId(null);
      setFormData({
        party_type: 'customer',
        legal_name: '',
        trading_name: '',
        legal_form: '',
        siret: '',
        vat_number: '',
        address_line1: '',
        postal_code: '',
        city: '',
        country_code: 'FR',
        email: '',
        phone: '',
        active: 1,
      });

      // Reload customers
      loadCustomers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (customer: Party) => {
    setEditingId(customer.id!);
    setFormData(customer);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
      return;
    }

    const response = await window.electron.party.delete(id);
    if (response.success) {
      loadCustomers();
    } else {
      setError(response.error || 'Failed to delete customer');
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">Gérez vos clients et leurs informations</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Nouveau client
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">
            {editingId ? 'Modifier le client' : 'Nouveau client'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Raison sociale *
                </label>
                <input
                  type="text"
                  name="legal_name"
                  value={formData.legal_name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom commercial
                </label>
                <input
                  type="text"
                  name="trading_name"
                  value={formData.trading_name || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SIRET
                </label>
                <input
                  type="text"
                  name="siret"
                  value={formData.siret || ''}
                  onChange={handleChange}
                  pattern="[0-9]{14}"
                  maxLength={14}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="14 chiffres"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de TVA
                </label>
                <input
                  type="text"
                  name="vat_number"
                  value={formData.vat_number || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="FR..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse
              </label>
              <input
                type="text"
                name="address_line1"
                value={formData.address_line1 || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code postal
                </label>
                <input
                  type="text"
                  name="postal_code"
                  value={formData.postal_code || ''}
                  onChange={handleChange}
                  pattern="[0-9]{5}"
                  maxLength={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ville
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pays
                </label>
                <input
                  type="text"
                  name="country_code"
                  value={formData.country_code}
                  onChange={handleChange}
                  maxLength={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingId ? 'Mettre à jour' : 'Créer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customers List */}
      {customers.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">Aucun client trouvé</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-blue-600 hover:underline mt-2"
          >
            Créer votre premier client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-gray-900">
                  {customer.legal_name}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(customer)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id!)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {customer.siret && (
                <p className="text-sm text-gray-600">SIRET: {customer.siret}</p>
              )}
              {customer.vat_number && (
                <p className="text-sm text-gray-600">TVA: {customer.vat_number}</p>
              )}

              <div className="mt-3 text-sm text-gray-700">
                {customer.address_line1 && <p>{customer.address_line1}</p>}
                {customer.postal_code && customer.city && (
                  <p>
                    {customer.postal_code} {customer.city}
                  </p>
                )}
              </div>

              {(customer.email || customer.phone) && (
                <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
                  {customer.email && <p>📧 {customer.email}</p>}
                  {customer.phone && <p>📞 {customer.phone}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Customers;
