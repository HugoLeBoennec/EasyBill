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
  CompanyTextFields,
  EMPTY_COMPANY_FORM,
  computeFrenchVatNumber,
  formFromParty,
  isPlaceholderCompany,
  normalizeCompanyForm,
  partyFieldsFromForm,
  sirenFromSiret,
  validateCompanyForm,
} from './companyValidation';
import {
  DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
  DEFAULT_LATE_PENALTY_TEXT,
  INDIVIDUAL_ENTREPRENEUR_MENTION,
  RECOVERY_FEE_TEXT,
  VAT_FRANCHISE_MENTION,
  hasShareCapital,
  isIndividualEntrepreneur,
} from '../../database/company-legal';

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

  const setField = (name: keyof CompanyForm, value: string | boolean) => {
    setSaved(false);
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // The SIREN is the first 9 digits of the SIRET
      if (name === 'siret') next.siren = sirenFromSiret(String(value));
      return next;
    });
    // Clear the error of the field being corrected (the VAT franchise switch
    // also lifts the VAT number requirement)
    setErrors((prev) => {
      const cleared: (keyof CompanyForm)[] =
        name === 'vat_franchise' ? [name, 'vat_number'] : [name];
      if (!cleared.some((key) => prev[key])) return prev;
      const next = { ...prev };
      cleared.forEach((key) => delete next[key]);
      return next;
    });
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = e.target;
    setField(
      target.name as keyof CompanyForm,
      target instanceof HTMLInputElement && target.type === 'checkbox'
        ? target.checked
        : target.value
    );
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
      setForm(normalizeCompanyForm(form));
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
    name: keyof CompanyTextFields,
    props: {
      placeholder?: string;
      type?: string;
      list?: string;
      inputMode?: 'numeric' | 'decimal';
    } = {}
  ) => (
    <input
      id={`company_${name}`}
      name={name}
      type={props.type || 'text'}
      list={props.list}
      inputMode={props.inputMode}
      value={form[name]}
      onChange={handleChange}
      placeholder={props.placeholder}
      aria-invalid={Boolean(errors[name])}
      aria-describedby={errors[name] ? `company_${name}_error` : undefined}
      className={inputClass(Boolean(errors[name]))}
    />
  );

  const checkbox = (
    name: 'vat_franchise' | 'recovery_fee_enabled',
    label: ReactNode,
    description: ReactNode
  ) => (
    <label
      htmlFor={`company_${name}`}
      className="flex items-start gap-3 cursor-pointer"
    >
      <input
        id={`company_${name}`}
        name={name}
        type="checkbox"
        checked={form[name]}
        onChange={handleChange}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>
        <span className="block text-sm font-medium text-gray-700">{label}</span>
        <span className="block text-xs text-gray-500">{description}</span>
      </span>
    </label>
  );

  const individual = isIndividualEntrepreneur(form.legal_form);
  const withCapital = hasShareCapital(form.legal_form);

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
              required={isFrench && !form.vat_franchise}
              error={errors.vat_number}
              className="md:col-span-2"
              hint={
                form.vat_franchise
                  ? 'Facultatif en franchise en base : à renseigner seulement si vous en avez un (opérations avec l\'Union européenne).'
                  : 'Obligatoire sur vos factures si vous êtes assujetti à la TVA.'
              }
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
          <div className="mt-4">
            {checkbox(
              'vat_franchise',
              'Franchise en base de TVA (art. 293 B du CGI)',
              'À cocher si vous ne facturez pas la TVA : micro-entrepreneur ou entreprise sous les seuils de la franchise.'
            )}
          </div>
          {form.vat_franchise && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
              Vos factures et devis seront émis sans TVA (taux à 0 % par
              défaut) et porteront la mention « {VAT_FRANCHISE_MENTION} ». Le
              numéro de TVA n'est plus exigé. Décochez cette case dès que vous
              dépassez les seuils de la franchise.
            </div>
          )}
        </div>

        {/* Legal mentions */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            Mentions légales
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Mentions obligatoires imprimées en pied de vos factures.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              name="share_capital"
              label="Capital social (€)"
              error={errors.share_capital}
              hint={
                withCapital
                  ? 'Obligatoire sur les factures d\'une société (SARL, SAS, SA...).'
                  : 'Sans objet pour cette forme juridique (pas de capital social).'
              }
            >
              <input
                id="company_share_capital"
                name="share_capital"
                type="text"
                inputMode="decimal"
                value={withCapital ? form.share_capital : ''}
                onChange={handleChange}
                disabled={!withCapital}
                placeholder={withCapital ? '10 000' : ''}
                aria-invalid={Boolean(errors.share_capital)}
                aria-describedby={
                  errors.share_capital ? 'company_share_capital_error' : undefined
                }
                className={`${inputClass(Boolean(errors.share_capital))} disabled:bg-gray-50 disabled:text-gray-500`}
              />
            </Field>
            <Field
              name="ape_code"
              label="Code APE / NAF"
              error={errors.ape_code}
              hint="4 chiffres et une lettre, indiqué sur votre avis de situation INSEE."
            >
              {text('ape_code', { placeholder: '6201Z' })}
            </Field>
            <Field
              name="registration_type"
              label="Immatriculation"
              error={errors.registration_type}
              hint="RCS pour les commerçants et sociétés, RM pour les artisans."
            >
              <select
                id="company_registration_type"
                name="registration_type"
                value={form.registration_type}
                onChange={handleChange}
                className={inputClass(Boolean(errors.registration_type))}
              >
                <option value="">Aucune (SIRET seul)</option>
                <option value="RCS">
                  RCS – Registre du commerce et des sociétés
                </option>
                <option value="RM">RM – Répertoire des métiers</option>
              </select>
            </Field>
            <Field
              name="registration_city"
              label="Ville d'immatriculation"
              error={errors.registration_city}
              hint="Ville du greffe ou de la chambre de métiers ; le numéro est votre SIREN."
            >
              <input
                id="company_registration_city"
                name="registration_city"
                type="text"
                value={form.registration_type ? form.registration_city : ''}
                onChange={handleChange}
                disabled={!form.registration_type}
                placeholder={form.registration_type ? 'Paris' : ''}
                className={`${inputClass(Boolean(errors.registration_city))} disabled:bg-gray-50 disabled:text-gray-500`}
              />
            </Field>
          </div>
          {individual && (
            <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded text-sm">
              Entrepreneur individuel : la mention «{' '}
              {INDIVIDUAL_ENTREPRENEUR_MENTION} », obligatoire depuis 2022, est
              ajoutée automatiquement à côté de votre nom sur vos factures.
            </div>
          )}
        </div>

        {/* Bank details */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            Coordonnées bancaires
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Imprimées sur vos factures pour le règlement par virement.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field
              name="iban"
              label="IBAN"
              error={errors.iban}
              className="md:col-span-2"
            >
              {text('iban', {
                placeholder: 'FR76 3000 6000 0112 3456 7890 189',
              })}
            </Field>
            <Field name="bic" label="BIC" error={errors.bic}>
              {text('bic', { placeholder: 'BNPAFRPP' })}
            </Field>
          </div>
        </div>

        {/* Payment conditions */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            Conditions de paiement
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Conditions par défaut, reprises sur toutes vos factures.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field
              name="default_payment_terms_days"
              label="Délai de paiement (jours)"
              error={errors.default_payment_terms_days}
              hint="30 jours par défaut, 60 jours au maximum."
            >
              {text('default_payment_terms_days', {
                inputMode: 'numeric',
                placeholder: '30',
              })}
            </Field>
            <Field
              name="late_penalty_text"
              label="Pénalités de retard"
              error={errors.late_penalty_text}
              className="md:col-span-2"
              hint="Mention obligatoire. Laissez vide pour reprendre le texte standard."
            >
              {text('late_penalty_text', {
                placeholder: DEFAULT_LATE_PENALTY_TEXT,
              })}
            </Field>
            <Field
              name="early_payment_discount_text"
              label="Escompte pour paiement anticipé"
              error={errors.early_payment_discount_text}
              className="md:col-span-3"
              hint="Mention obligatoire, même en l'absence d'escompte."
            >
              {text('early_payment_discount_text', {
                placeholder: DEFAULT_EARLY_PAYMENT_DISCOUNT_TEXT,
              })}
            </Field>
          </div>
          <div className="mt-4">
            {checkbox(
              'recovery_fee_enabled',
              `Afficher la mention « ${RECOVERY_FEE_TEXT} »`,
              'Obligatoire sur les factures adressées à des professionnels.'
            )}
          </div>
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
