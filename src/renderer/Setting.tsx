import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { LocaleContext } from './LocaleContext';
import { InputText, InputBase } from './components/inputs';

import fr from './locales/fr';
import en from './locales/en';

const toId = (text: string) => {
  return text.toLocaleLowerCase().replaceAll(' ', '');
};

const Setting = () => {
  const locale = useContext(LocaleContext);
  const c = locale === 'fr' ? fr.common : en.common;
  const t = locale === 'fr' ? fr.settingPage : en.settingPage;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-600 mt-1">
          Gérez les paramètres de votre entreprise et de l'application
        </p>
      </div>

      {/* Configuration Sections */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Configuration avancée
        </h2>
        <div className="flex flex-col gap-3">
          <Link
            to="./company"
            className="p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <div className="flex items-center">
              <span className="text-2xl mr-3">⚙️</span>
              <div>
                <div className="font-medium text-gray-900">Company Setting</div>
                <div className="text-sm text-gray-600">
                  Configure your company information
                </div>
              </div>
            </div>
          </Link>
          <Link
            to="./einvoicing"
            className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border-2 border-blue-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-2xl mr-3">📄</span>
                <div>
                  <div className="font-medium text-gray-900">
                    Electronic Invoicing (2026)
                  </div>
                  <div className="text-sm text-gray-600">
                    Configure e-invoicing compliance settings
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">
                ACTION REQUIRED
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Quick Settings Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Paramètres rapides
        </h2>
        <div className="space-y-4">
          <InputBase label={t.company} id={`inp_${toId(t.company)}_base`}>
            <InputText
              id={`inp_${toId(t.company)}`}
              type="text"
              placeholder="Google"
            />
          </InputBase>
          <InputBase label={t.address} id={`inp_${toId(t.address)}_base`}>
            <InputText
              id={`inp_${toId(t.address)}`}
              type="text"
              placeholder="42 rue de la vérité"
            />
          </InputBase>
          <InputBase label={t.zip} id={`inp_${toId(t.zip)}_base`}>
            <InputText
              id={`inp_${toId(t.zip)}`}
              type="text"
              placeholder="75000"
            />
          </InputBase>
          <InputBase label={t.city} id={`inp_${toId(t.city)}_base`}>
            <InputText
              id={`inp_${toId(t.city)}`}
              type="text"
              placeholder="Paris"
            />
          </InputBase>
          <InputBase label={t.phone} id={`inp_${toId(t.phone)}_base`}>
            <InputText
              id={`inp_${toId(t.phone)}`}
              type="text"
              placeholder="0601020304"
            />
          </InputBase>
          <InputBase label={t.legal} id={`inp_${toId(t.legal)}_base`}>
            <InputText id={`inp_${toId(t.legal)}`} type="text" />
          </InputBase>
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Setting;
