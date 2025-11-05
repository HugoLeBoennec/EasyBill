import { useContext, useState, useEffect } from 'react';
import { LocaleContext } from './LocaleContext';
import { InputText, InputCheckBox, InputRadio } from './components/inputs';
import fr from './locales/fr';
import en from './locales/en';
import {
  loadSettings,
  saveSettings as persistSettings,
  validateSettings,
  settingsStore,
  type EInvoicingSettings,
  type Platform,
  type InvoiceFormat,
  type Environment,
} from '../services/einvoicing/storage';

const EInvoicing = () => {
  const locale = useContext(LocaleContext);
  const t = locale === 'fr' ? fr.eInvoicingPage : en.eInvoicingPage;

  // State for settings
  const [settings, setSettings] = useState<EInvoicingSettings>(() => loadSettings());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
  }, []);

  // Auto-populate API endpoint when platform or environment changes
  useEffect(() => {
    if (settings.platform !== 'other') {
      const endpoint = settingsStore.getDefaultEndpoint(
        settings.platform,
        settings.environment
      );
      if (endpoint && endpoint !== settings.apiEndpoint) {
        setSettings((prev) => ({ ...prev, apiEndpoint: endpoint }));
      }
    }
  }, [settings.platform, settings.environment]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    // Simulate API test (replace with actual implementation)
    setTimeout(() => {
      setTesting(false);
      setTestResult('success'); // or 'failed'
    }, 2000);
  };

  const handleSave = () => {
    // Clear previous errors and success message
    setValidationErrors([]);
    setSaveSuccess(false);

    // Validate settings
    const validation = validateSettings(settings);

    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Save settings
    try {
      persistSettings(settings);
      setSaveSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      setValidationErrors([
        error instanceof Error ? error.message : 'Failed to save settings',
      ]);
    }
  };

  const handlePlatformChange = (platform: Platform) => {
    setSettings((prev) => ({ ...prev, platform }));
  };

  const handleFormatChange = (format: InvoiceFormat) => {
    setSettings((prev) => ({ ...prev, defaultFormat: format }));
  };

  return (
    <div className="flex flex-col text-black max-w-4xl mx-auto p-6">
      {/* Title */}
      <h1 className="text-3xl font-bold mb-2">{t.title}</h1>

      {/* Compliance Warning Banner */}
      <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              {t.complianceWarning}
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              {t.complianceWarningDesc}
            </div>
          </div>
        </div>
      </div>

      {/* Enable E-Invoicing Toggle */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              setSettings({ ...settings, enabled: e.target.checked })
            }
            className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="ml-3 text-lg font-medium text-gray-900">
            {t.enabled}
          </span>
        </label>
        <p className="ml-8 mt-1 text-sm text-gray-500">{t.enabledHelp}</p>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 rounded">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Validation Errors
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc pl-5 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Success Message */}
      {saveSuccess && (
        <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-400 rounded">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{t.saved}</p>
            </div>
          </div>
        </div>
      )}

      {/* Settings Form (only shown if enabled) */}
      {settings.enabled && (
        <>
          {/* Platform Selection */}
          <div className="mb-6 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">{t.platform}</h2>
            <p className="text-sm text-gray-600 mb-4">{t.platformHelp}</p>

            <div className="space-y-3">
              {/* Chorus Pro */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="platform"
                  value="chorus-pro"
                  checked={settings.platform === 'chorus-pro'}
                  onChange={() => handlePlatformChange('chorus-pro')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900">
                      {t.chorusPro}
                    </span>
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
                      FREE
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{t.chorusProDesc}</p>
                </div>
              </label>

              {/* Tiime */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="platform"
                  value="tiime"
                  checked={settings.platform === 'tiime'}
                  onChange={() => handlePlatformChange('tiime')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <span className="font-medium text-gray-900">{t.tiime}</span>
                  <p className="text-sm text-gray-500">{t.tiimeDesc}</p>
                </div>
              </label>

              {/* Pennylane */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="platform"
                  value="pennylane"
                  checked={settings.platform === 'pennylane'}
                  onChange={() => handlePlatformChange('pennylane')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <span className="font-medium text-gray-900">
                    {t.pennylane}
                  </span>
                  <p className="text-sm text-gray-500">{t.pennylaneDesc}</p>
                </div>
              </label>

              {/* Sage */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="platform"
                  value="sage"
                  checked={settings.platform === 'sage'}
                  onChange={() => handlePlatformChange('sage')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <span className="font-medium text-gray-900">{t.sage}</span>
                  <p className="text-sm text-gray-500">{t.sageDesc}</p>
                </div>
              </label>

              {/* Other */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="platform"
                  value="other"
                  checked={settings.platform === 'other'}
                  onChange={() => handlePlatformChange('other')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <span className="font-medium text-gray-900">{t.other}</span>
                  <p className="text-sm text-gray-500">{t.otherDesc}</p>
                </div>
              </label>
            </div>
          </div>

          {/* API Configuration */}
          <div className="mb-6 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">{t.apiConfig}</h2>

            <div className="space-y-4">
              {/* Environment Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t.environment}
                </label>
                <select
                  value={settings.environment}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      environment: e.target.value as Environment,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="qualification">{t.envQualification}</option>
                  <option value="production">{t.envProduction}</option>
                </select>
              </div>

              {/* API Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t.apiEndpoint}
                </label>
                <InputText
                  id="api-endpoint"
                  type="url"
                  placeholder="https://api.example.com"
                  value={settings.apiEndpoint}
                  onChange={(e) =>
                    setSettings({ ...settings, apiEndpoint: e.target.value })
                  }
                />
              </div>

              {/* Client ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t.clientId}
                </label>
                <InputText
                  id="client-id"
                  type="text"
                  placeholder="your-client-id"
                  value={settings.clientId}
                  onChange={(e) =>
                    setSettings({ ...settings, clientId: e.target.value })
                  }
                />
              </div>

              {/* Client Secret */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t.clientSecret}
                </label>
                <div className="relative">
                  <InputText
                    id="client-secret"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••••••"
                    value={settings.clientSecret}
                    onChange={(e) =>
                      setSettings({ ...settings, clientSecret: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? '🔓' : '🔒'}
                  </button>
                </div>
              </div>

              {/* Test Connection Button */}
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
                  testing
                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {testing ? t.testing : t.testConnection}
              </button>

              {/* Test Result */}
              {testResult && (
                <div
                  className={`p-3 rounded-md ${
                    testResult === 'success'
                      ? 'bg-green-50 text-green-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  {testResult === 'success' ? '✓ ' : '✗ '}
                  {testResult === 'success' ? t.testSuccess : t.testFailed}
                </div>
              )}
            </div>
          </div>

          {/* Default Format */}
          <div className="mb-6 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">{t.defaultFormat}</h2>

            <div className="space-y-3">
              {/* Factur-X */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="format"
                  value="facturx"
                  checked={settings.defaultFormat === 'facturx'}
                  onChange={() => handleFormatChange('facturx')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <div className="flex items-center">
                    <span className="font-medium text-gray-900">
                      {t.facturx}
                    </span>
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      RECOMMENDED
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{t.facturxDesc}</p>
                </div>
              </label>

              {/* UBL */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="format"
                  value="ubl"
                  checked={settings.defaultFormat === 'ubl'}
                  onChange={() => handleFormatChange('ubl')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <span className="font-medium text-gray-900">{t.ubl}</span>
                  <p className="text-sm text-gray-500">{t.ublDesc}</p>
                </div>
              </label>

              {/* CII */}
              <label className="flex items-start cursor-pointer p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="format"
                  value="cii"
                  checked={settings.defaultFormat === 'cii'}
                  onChange={() => handleFormatChange('cii')}
                  className="mt-1 w-4 h-4"
                />
                <div className="ml-3 flex-1">
                  <span className="font-medium text-gray-900">{t.cii}</span>
                  <p className="text-sm text-gray-500">{t.ciiDesc}</p>
                </div>
              </label>
            </div>
          </div>

          {/* Options */}
          <div className="mb-6 p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3">{t.options}</h2>

            <div className="space-y-4">
              {/* Auto Send */}
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoSend}
                  onChange={(e) =>
                    setSettings({ ...settings, autoSend: e.target.checked })
                  }
                  className="mt-1 w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="font-medium text-gray-900">
                    {t.autoSend}
                  </span>
                  <p className="text-sm text-gray-500">{t.autoSendHelp}</p>
                </div>
              </label>

              {/* Offline Mode */}
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.offlineMode}
                  onChange={(e) =>
                    setSettings({ ...settings, offlineMode: e.target.checked })
                  }
                  className="mt-1 w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="ml-3">
                  <span className="font-medium text-gray-900">
                    {t.offlineMode}
                  </span>
                  <p className="text-sm text-gray-500">{t.offlineModeHelp}</p>
                </div>
              </label>
            </div>
          </div>

          {/* Save/Cancel Buttons */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-3 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t.save}
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
            >
              {t.cancel}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EInvoicing;
