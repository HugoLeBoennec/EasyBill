import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStrings } from './LocaleContext';
import type { DatabaseInfo, DatabaseStats } from '../database/types';
import { isCompanyProfileComplete } from './pages/companyValidation';

type Notice = { kind: 'success' | 'error'; text: string; detail?: string };

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

const Setting = () => {
  const t = useStrings().settingPage;

  const [info, setInfo] = useState<DatabaseInfo | null>(null);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [companyComplete, setCompanyComplete] = useState(true);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadDatabaseInfo = useCallback(async () => {
    try {
      const [infoResp, statsResp, companyResp] = await Promise.all([
        window.electron.database.getInfo(),
        window.electron.database.getStats(),
        window.electron.party.getCompany(),
      ]);
      setInfo(infoResp.success ? infoResp.data ?? null : null);
      setStats(statsResp.success ? statsResp.data ?? null : null);
      if (companyResp.success) {
        setCompanyComplete(isCompanyProfileComplete(companyResp.data));
      }
    } catch {
      setInfo(null);
      setStats(null);
    }
  }, []);

  useEffect(() => {
    loadDatabaseInfo();
  }, [loadDatabaseInfo]);

  const handleBackup = async () => {
    setBusy('backup');
    setNotice(null);
    try {
      const response = await window.electron.database.backupWithDialog();
      if (!response.success) {
        setNotice({ kind: 'error', text: t.actionFailed, detail: response.error });
      } else if (response.data && !response.data.canceled) {
        setNotice({
          kind: 'success',
          text: t.backupDone,
          detail: response.data.path,
        });
      }
    } catch (err) {
      setNotice({
        kind: 'error',
        text: t.actionFailed,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy('restore');
    setNotice(null);
    try {
      // The main process asks for the file and for confirmation
      const response = await window.electron.database.restoreWithDialog();
      if (!response.success) {
        setNotice({ kind: 'error', text: t.actionFailed, detail: response.error });
      } else if (response.data && !response.data.canceled) {
        setNotice({
          kind: 'success',
          text: t.restoreDone,
          detail: response.data.safetyCopy,
        });
      }
      await loadDatabaseInfo();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: t.actionFailed,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const statItems: [string, number | undefined][] = [
    [t.statInvoices, stats?.total_invoices],
    [t.statDrafts, stats?.draft_invoices],
    [t.statQuotes, stats?.total_quotes],
    [t.statCustomers, stats?.total_customers],
    [t.statPending, stats?.pending_einvoices],
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t.pageName}</h1>
        <p className="text-gray-600 mt-1">{t.subtitle}</p>
      </div>

      {/* Configuration Sections */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t.configuration}
        </h2>
        <div className="flex flex-col gap-3">
          <Link
            to="/setting/company"
            className="p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-2xl mr-3">🏢</span>
                <div>
                  <div className="font-medium text-gray-900">
                    {t.companyTitle}
                  </div>
                  <div className="text-sm text-gray-600">{t.companyDesc}</div>
                </div>
              </div>
              {!companyComplete && (
                <span className="px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">
                  {t.companyMissing}
                </span>
              )}
            </div>
          </Link>
          <Link
            to="/setting/einvoicing"
            className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border-2 border-blue-200"
          >
            <div className="flex items-center">
              <span className="text-2xl mr-3">📄</span>
              <div>
                <div className="font-medium text-gray-900">
                  {t.einvoicingTitle}
                </div>
                <div className="text-sm text-gray-600">{t.einvoicingDesc}</div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Backup & restore */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {t.backupTitle}
        </h2>
        <p className="text-gray-600 mb-4">{t.backupDesc}</p>

        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`px-4 py-3 rounded mb-4 border ${
              notice.kind === 'error'
                ? 'bg-red-100 border-red-400 text-red-700'
                : 'bg-green-100 border-green-400 text-green-700'
            }`}
          >
            {notice.text}
            {notice.detail && (
              <span className="block break-all text-sm mt-1">
                {notice.detail}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleBackup}
            disabled={busy !== null}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
          >
            {busy === 'backup' ? t.backupRunning : t.backupButton}
          </button>
          <button
            type="button"
            onClick={handleRestore}
            disabled={busy !== null}
            className="px-6 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium disabled:opacity-60"
          >
            {busy === 'restore' ? t.restoreRunning : t.restoreButton}
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-3">{t.restoreWarning}</p>
      </div>

      {/* Database info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {t.dbInfoTitle}
        </h2>
        {!info && !stats ? (
          <p className="text-gray-500">{t.dbUnavailable}</p>
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {statItems.map(([label, value]) => (
                  <div key={label} className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900">
                      {value ?? 0}
                    </div>
                    <div className="text-sm text-gray-600">{label}</div>
                  </div>
                ))}
              </div>
            )}
            {info && (
              <dl className="grid grid-cols-1 md:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-gray-700">{t.dbPath}</dt>
                <dd className="text-gray-900 break-all">{info.path}</dd>
                <dt className="font-medium text-gray-700">{t.dbSize}</dt>
                <dd className="text-gray-900">{formatSize(info.size)}</dd>
                <dt className="font-medium text-gray-700">{t.dbVersion}</dt>
                <dd className="text-gray-900">{info.version}</dd>
                <dt className="font-medium text-gray-700">{t.dbTables}</dt>
                <dd className="text-gray-900">{info.tables.length}</dd>
              </dl>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Setting;
