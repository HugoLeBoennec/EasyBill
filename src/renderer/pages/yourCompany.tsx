/**
 * Company profile ("Mon entreprise")
 *
 * Legal identity of the seller, stored as the party flagged `company`.
 * It is created on first save and updated afterwards.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CompanyErrors,
  CompanyForm,
  EMPTY_COMPANY_FORM,
  computeFrenchVatNumber,
  formFromParty,
  isPlaceholderCompany,
  partyFieldsFromForm,
  sirenFromSiret,
  validateCompanyForm,
} from './companyValidation';

const LEGAL_FORMS = [
  'EI',
  'EI (micro-entrepreneur)',
  'EIRL',
  'EURL',
  'SARL',
  'SASU',
  'SAS',
  'SA',
  'SNC',
  'SCI',
  'SELARL',
  'Association',
];

const COUNTRIES: [string, string][] = [
  ['FR', 'France'],
  ['BE', 'Belgique'],
  ['CH', 'Suisse'],
  ['LU', 'Luxembourg'],
  ['MC', 'Monaco'],
  ['DE', 'Allemagne'],
  ['ES', 'Espagne'],
  ['IT', 'Italie'],
  ['NL', 'Pays-Bas'],
  ['PT', 'Portugal'],
  ['GB', 'Royaume-Uni'],
];

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:ring-blue-500'
  }`;

type FieldProps = {
  name: keyof CompanyForm;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

const Field = ({
  name,
  label,
  required,
  error,
  hint,
  className,
  children,
}: FieldProps) => (
  <div className={className}>
    <label
      htmlFor={`company_${name}`}
      className="block text-sm font-medium text-gray-700 mb-1"
    >
      {label}
      {required && <span className="text-red-600"> *</span>}
    </label>
    {children}
    {error ? (
      <p id={`company_${name}_error`} className="mt-1 text-sm text-red-600">
        {error}
      </p>
    ) : (
      hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>
    )}
  </div>
);

const CompanyPage = () => {
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY_FORM);
  const [companyId, setCompanyId] = useState<number | null>(null);
  // False until real values have been saved (no row, or the seeded placeholder)
  const [configured, setConfigured] = useState(false);
  const [errors, setErrors] = useState<CompanyErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await window.electron.party.getCompany();
        if (cancelled) return;
        if (!response.success) {
          setFailure(
            response.error || "Impossible de charger le profil de l'entreprise."
          );
        } else if (response.data?.id != null) {
          setCompanyId(response.data.id);
          setForm(formFromParty(response.data));
          setConfigured(!isPlaceholderCompany(response.data));
        }
      } catch (err) {
        if (!cancelled) {
          setFailure(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Outcome banners sit at the top of the page: bring them into view
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (saved || failure) topRef.current?.scrollIntoView({ block: 'start' });
  }, [saved, failure]);

  const setField = (name: keyof CompanyForm, value: string) => {
    setSaved(false);
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // The SIREN is the first 9 digits of the SIRET
      if (name === 'siret') next.siren = sirenFromSiret(value);
      return next;
    });
    // Clear the error of the field being corrected
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setField(e.target.name as keyof CompanyForm, e.target.value);
  };

  const isFrench = form.country_code.trim().toUpperCase() === 'FR';
  const computedVat = isFrench ? computeFrenchVatNumber(form.siren) : null;
  const vatMatchesComputed =
    computedVat !== null &&
    form.vat_number.replace(/[\s.\-_]/g, '').toUpperCase() === computedVat;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaved(false);
    setFailure(null);

    const validation = validateCompanyForm(form);
    setErrors(validation);
    const firstInvalid = Object.keys(validation)[0];
    if (firstInvalid) {
      document.getElementById(`company_${firstInvalid}`)?.focus();
      return;
    }

    const fields = partyFieldsFromForm(form);
    setSaving(true);
    try {
      if (companyId !== null) {
        const response = await window.electron.party.update(companyId, fields);
        if (!response.success) {
          setFailure(response.error || "L'enregistrement a échoué.");
          return;
        }
      } else {
        const response = await window.electron.party.create({
          ...fields,
          party_type: 'company',
          state_region: '',
          electronic_address: '',
          electronic_address_scheme: '',
          active: 1,
        });
        if (!response.success || response.data == null) {
          setFailure(response.error || "L'enregistrement a échoué.");
          return;
        }
        setCompanyId(response.data);
      }
      setForm(fields);
      setConfigured(true);
      setSaved(true);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
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

  const countryOptions = COUNTRIES.some(([code]) => code === form.country_code)
    ? COUNTRIES
    : [...COUNTRIES, [form.country_code, form.country_code] as [string, string]];

  const text = (
    name: keyof CompanyForm,
    props: { placeholder?: string; type?: string; list?: string } = {}
  ) => (
    <input
      id={`company_${name}`}
      name={name}
      type={props.type || 'text'}
      list={props.list}
      value={form[name]}
      onChange={handleChange}
      placeholder={props.placeholder}
      aria-invalid={Boolean(errors[name])}
      aria-describedby={errors[name] ? `company_${name}_error` : undefined}
      className={inputClass(Boolean(errors[name]))}
    />
  );

  const errorCount = Object.keys(errors).length;

  return (
    <div className="p-6" ref={topRef}>
      {/* Header */}
      <div className="mb-6">
        <Link to="/setting" className="text-sm text-blue-600 hover:underline">
          ← Paramètres
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">Mon entreprise</h1>
        <p className="text-gray-600 mt-1">
          Votre identité légale de vendeur, reprise sur vos factures et devis
        </p>
      </div>

      {!configured && !saved && !failure && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4">
          Aucun profil enregistré pour l'instant. Renseignez les informations
          ci-dessous avant d'émettre votre première facture.
        </div>
      )}
      {failure && (
        <div
          role="alert"
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
        >
          {failure}
        </div>
      )}
      {errorCount > 0 && (
        <div
          role="alert"
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
        >
          {errorCount === 1
            ? 'Un champ est à corriger avant de pouvoir enregistrer.'
            : `${errorCount} champs sont à corriger avant de pouvoir enregistrer.`}
        </div>
      )}
      {saved && (
        <div
          role="status"
          className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4"
        >
          Profil de l'entreprise enregistré.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Legal identity */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Identité légale
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              name="legal_name"
              label="Dénomination sociale"
              required
              error={errors.legal_name}
              hint="Entrepreneur individuel : vos nom et prénom."
            >
              {text('legal_name')}
            </Field>
            <Field
              name="trading_name"
              label="Nom commercial"
              error={errors.trading_name}
            >
              {text('trading_name')}
            </Field>
            <Field
              name="legal_form"
              label="Forme juridique"
              error={errors.legal_form}
              hint="Choisissez dans la liste ou saisissez la vôtre."
            >
              {text('legal_form', {
                list: 'company_legal_forms',
                placeholder: 'EI, EURL, SASU...',
              })}
              <datalist id="company_legal_forms">
                {LEGAL_FORMS.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </Field>
            <Field
              name="country_code"
              label="Pays"
              required
              error={errors.country_code}
            >
              <select
                id="company_country_code"
                name="country_code"
                value={form.country_code}
                onChange={handleChange}
                className={inputClass(Boolean(errors.country_code))}
              >
                {countryOptions.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label === code ? code : `${label} (${code})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name="siret"
              label="SIRET"
              required={isFrench}
              error={errors.siret}
              hint="14 chiffres, les espaces sont acceptés."
            >
              {text('siret', { placeholder: '123 456 789 00012' })}
            </Field>
            <Field
              name="siren"
              label="SIREN"
              hint="Déduit automatiquement du SIRET (9 premiers chiffres)."
            >
              <input
                id="company_siren"
                name="siren"
                type="text"
                value={form.siren}
                readOnly
                tabIndex={-1}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
              />
            </Field>
            <Field
              name="vat_number"
              label="N° de TVA intracommunautaire"
              error={errors.vat_number}
              className="md:col-span-2"
              hint="Laissez vide si vous n'êtes pas assujetti (franchise en base de TVA)."
            >
              <div className="flex gap-2">
                {text('vat_number', { placeholder: 'FR12345678901' })}
                <button
                  type="button"
                  disabled={computedVat === null || vatMatchesComputed}
                  onClick={() =>
                    computedVat && setField('vat_number', computedVat)
                  }
                  title={
                    computedVat === null
                      ? 'Saisissez d\'abord un SIRET français valide'
                      : undefined
                  }
                  className="shrink-0 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  Calculer depuis le SIREN
                </button>
              </div>
            </Field>
          </div>
          {!form.vat_number.trim() && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
              Sans numéro de TVA, vos factures doivent porter la mention
              « TVA non applicable, art. 293 B du CGI » (franchise en base).
            </div>
          )}
        </div>

        {/* Address */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Adresse du siège
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field
              name="address_line1"
              label="Adresse"
              required
              error={errors.address_line1}
              className="md:col-span-3"
            >
              {text('address_line1', { placeholder: '42 rue de la Paix' })}
            </Field>
            <Field
              name="address_line2"
              label="Complément d'adresse"
              error={errors.address_line2}
              className="md:col-span-3"
            >
              {text('address_line2')}
            </Field>
            <Field
              name="postal_code"
              label="Code postal"
              required
              error={errors.postal_code}
            >
              {text('postal_code', { placeholder: '75002' })}
            </Field>
            <Field
              name="city"
              label="Ville"
              required
              error={errors.city}
              className="md:col-span-2"
            >
              {text('city', { placeholder: 'Paris' })}
            </Field>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              name="contact_name"
              label="Nom du contact"
              error={errors.contact_name}
            >
              {text('contact_name')}
            </Field>
            <Field name="email" label="E-mail" error={errors.email}>
              {text('email', {
                type: 'email',
                placeholder: 'contact@exemple.fr',
              })}
            </Field>
            <Field name="phone" label="Téléphone" error={errors.phone}>
              {text('phone', { type: 'tel', placeholder: '06 01 02 03 04' })}
            </Field>
            <Field name="website" label="Site web" error={errors.website}>
              {text('website', { placeholder: 'https://exemple.fr' })}
            </Field>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CompanyPage;
