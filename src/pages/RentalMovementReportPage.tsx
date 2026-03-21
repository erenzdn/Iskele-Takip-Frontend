import { useState, useEffect, useCallback } from 'react';
import { ChartBarIcon, FilePdfIcon, PencilIcon, CopyIcon, TrashIcon, GearIcon } from '@phosphor-icons/react';
import { reportService, ReportDateParams, ReportPdfParams } from '../services/reportService';
import { reportTemplateService } from '../services/reportTemplateService';
import { customerService } from '../services/customerService';
import { siteService } from '../services/siteService';
import {
  Customer,
  ConstructionSite,
  RentalMovementReportResponse,
  RentalMovementSummaryCustomer,
  RentalMovementSummarySite,
  RentalMovementSummaryGlobal,
  ReportTemplate,
} from '../models';
import { useAuthStore } from '../store/authStore';
import EmptyState from '../components/EmptyState';
import PdfPreviewModal from '../components/modals/PdfPreviewModal';
import ReportTemplateEditorModal from '../components/modals/ReportTemplateEditorModal';

type ReportType = 'customer' | 'site' | 'global';

function isSummaryCustomer(s: RentalMovementReportResponse['summary']): s is RentalMovementSummaryCustomer {
  return 'customer_name' in s && !('site_name' in s) && !('total_customers' in s);
}
function isSummarySite(s: RentalMovementReportResponse['summary']): s is RentalMovementSummarySite {
  return 'site_name' in s;
}
function isSummaryGlobal(s: RentalMovementReportResponse['summary']): s is RentalMovementSummaryGlobal {
  return 'total_customers' in s;
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function RentalMovementReportPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = user?.Permissions?.includes('reports_view');
  const canViewTemplates = user?.Permissions?.includes('reportTemplates_view');
  const canCreateTemplate = user?.Permissions?.includes('reportTemplates_create');
  const canUpdateTemplate = user?.Permissions?.includes('reportTemplates_update');
  const canDeleteTemplate = user?.Permissions?.includes('reportTemplates_delete');

  const [reportType, setReportType] = useState<ReportType>('customer');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [selectedSiteId, setSelectedSiteId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [data, setData] = useState<RentalMovementReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [showManageTemplates, setShowManageTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!hasPermission) return;
    let cancelled = false;
    customerService
      .getAllAsync()
      .then((list) => {
        if (!cancelled) setCustomers(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  useEffect(() => {
    if (reportType !== 'site' || !selectedCustomerId) {
      setSites([]);
      setSelectedSiteId('');
      return;
    }
    let cancelled = false;
    siteService
      .getByCustomerAsync(selectedCustomerId)
      .then((list) => {
        if (!cancelled) setSites(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reportType, selectedCustomerId]);

  useEffect(() => {
    if (!canViewTemplates) return;
    let cancelled = false;
    reportTemplateService
      .getAllAsync()
      .then((list) => {
        if (!cancelled) setReportTemplates(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setReportTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewTemplates]);

  const getDateParams = useCallback((): ReportDateParams | undefined => {
    if (!dateFrom && !dateTo) return undefined;
    const params: ReportDateParams = {};
    if (dateFrom) params.dateFrom = new Date(dateFrom + 'T00:00:00').toISOString();
    if (dateTo) params.dateTo = new Date(dateTo + 'T23:59:59.999').toISOString();
    return params;
  }, [dateFrom, dateTo]);

  const getPdfParams = useCallback((): ReportPdfParams | undefined => {
    const params: ReportPdfParams = {};
    if (dateFrom) params.dateFrom = new Date(dateFrom + 'T00:00:00').toISOString();
    if (dateTo) params.dateTo = new Date(dateTo + 'T23:59:59.999').toISOString();
    if (selectedTemplateId !== '') params.templateId = selectedTemplateId as number;
    return Object.keys(params).length > 0 ? params : undefined;
  }, [dateFrom, dateTo, selectedTemplateId]);

  const canFetch =
    reportType === 'global' ||
    (reportType === 'customer' && selectedCustomerId !== '') ||
    (reportType === 'site' && selectedSiteId !== '');

  const loadReport = useCallback(async () => {
    if (!hasPermission || !canFetch) return;
    setError(null);
    setLoading(true);
    try {
      const params = getDateParams();
      if (reportType === 'customer') {
        const res = await reportService.getCustomerReportAsync(selectedCustomerId as number, params);
        setData(res);
      } else if (reportType === 'site') {
        const res = await reportService.getSiteReportAsync(selectedSiteId as number, params);
        setData(res);
      } else {
        const res = await reportService.getGlobalReportAsync(params);
        setData(res);
      }
    } catch (err) {
      console.error('Rental movement report error:', err);
      setError('Rapor yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hasPermission, canFetch, reportType, selectedCustomerId, selectedSiteId, getDateParams]);

  const canFetchPdf = !!data && canFetch;

  const fetchPdfBlob = useCallback(async (): Promise<Blob | null> => {
    if (!canFetchPdf) return null;
    const params = getPdfParams();
    try {
      setPdfLoading(true);
      if (reportType === 'customer') {
        return await reportService.getCustomerReportPdfAsync(selectedCustomerId as number, params);
      }
      if (reportType === 'site') {
        return await reportService.getSiteReportPdfAsync(selectedSiteId as number, params);
      }
      return await reportService.getGlobalReportPdfAsync(params);
    } catch (err) {
      console.error('Report PDF error:', err);
      setError('PDF oluşturulurken bir hata oluştu.');
      return null;
    } finally {
      setPdfLoading(false);
    }
  }, [canFetchPdf, reportType, selectedCustomerId, selectedSiteId, getPdfParams]);

  const handlePdfPreview = useCallback(async () => {
    const blob = await fetchPdfBlob();
    if (!blob || blob.size === 0) return;
    const url = window.URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
    setShowPdfPreview(true);
  }, [fetchPdfBlob]);

  const handlePdfDownload = useCallback(async () => {
    const blob = await fetchPdfBlob();
    if (!blob || blob.size === 0) return;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kiralama-hareket-raporu.pdf';
    a.click();
    window.URL.revokeObjectURL(url);
  }, [fetchPdfBlob]);

  const closePdfPreview = useCallback(() => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  }, [pdfPreviewUrl]);

  const loadReportTemplates = useCallback(() => {
    if (!canViewTemplates) return;
    reportTemplateService.getAllAsync().then(setReportTemplates).catch(() => setReportTemplates([]));
  }, [canViewTemplates]);

  const handleCopyTemplate = useCallback(
    async (t: ReportTemplate) => {
      if (!canCreateTemplate) return;
      try {
        await reportTemplateService.copyAsync(t.TemplateId, `${t.TemplateName} (Kopya)`);
        loadReportTemplates();
      } catch (err) {
        console.error('Copy template error:', err);
        alert('Kopyalama başarısız.');
      }
    },
    [canCreateTemplate, loadReportTemplates]
  );

  const handleDeleteTemplate = useCallback(
    async (t: ReportTemplate) => {
      if (!canDeleteTemplate) return;
      if (!window.confirm(`"${t.TemplateName}" şablonunu silmek istediğinize emin misiniz?`)) return;
      try {
        await reportTemplateService.deleteAsync(t.TemplateId);
        loadReportTemplates();
        if (selectedTemplateId === t.TemplateId) setSelectedTemplateId('');
      } catch (err) {
        console.error('Delete template error:', err);
        alert('Silme başarısız.');
      }
    },
    [canDeleteTemplate, loadReportTemplates, selectedTemplateId]
  );

  const setDateRangeToday = () => {
    const today = toDateOnly(new Date());
    setDateFrom(today);
    setDateTo(today);
  };

  const setDateRangeLast7Days = () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    setDateFrom(toDateOnly(start));
    setDateTo(toDateOnly(end));
  };

  if (!hasPermission) {
    return (
      <div className="p-8">
        <div className="card p-8 text-center">
          <p className="text-lg text-text-secondary">Bu sayfayı görüntüleme yetkiniz yok.</p>
          <p className="text-sm text-text-secondary mt-2">
            Kiralama hareket raporu için <code>reports_view</code> izni gerekir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Kiralama Hareket Raporu</h1>
      </div>

      <div className="card p-4 mb-3">
        <h2 className="font-semibold mb-3">Filtreler</h2>

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">Rapor Türü</label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reportType"
                checked={reportType === 'customer'}
                onChange={() => setReportType('customer')}
                className="border-gray-600 bg-gray-700 text-primary"
              />
              <span className="text-sm">Müşteri</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reportType"
                checked={reportType === 'site'}
                onChange={() => setReportType('site')}
                className="border-gray-600 bg-gray-700 text-primary"
              />
              <span className="text-sm">Şantiye</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reportType"
                checked={reportType === 'global'}
                onChange={() => setReportType('global')}
                className="border-gray-600 bg-gray-700 text-primary"
              />
              <span className="text-sm">Global Envanter</span>
            </label>
          </div>
        </div>

        {reportType === 'customer' && (
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-2">Müşteri</label>
            <select
              value={selectedCustomerId === '' ? '' : selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value === '' ? '' : Number(e.target.value))}
              className="input w-full max-w-md"
            >
              <option value="">Müşteri seçin</option>
              {customers.map((c) => (
                <option key={c.CustomerId} value={c.CustomerId}>
                  {c.Name}
                </option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'site' && (
          <>
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">Müşteri</label>
              <select
                value={selectedCustomerId === '' ? '' : selectedCustomerId}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Number(e.target.value);
                  setSelectedCustomerId(v);
                  setSelectedSiteId('');
                }}
                className="input w-full max-w-md"
              >
                <option value="">Müşteri seçin</option>
                {customers.map((c) => (
                  <option key={c.CustomerId} value={c.CustomerId}>
                    {c.Name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-text-secondary mb-2">Şantiye</label>
              <select
                value={selectedSiteId === '' ? '' : selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value === '' ? '' : Number(e.target.value))}
                className="input w-full max-w-md"
                disabled={!selectedCustomerId}
              >
                <option value="">Şantiye seçin</option>
                {sites.map((s) => (
                  <option key={s.SiteId} value={s.SiteId}>
                    {s.SiteName}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">Tarih Aralığı (opsiyonel)</label>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={setDateRangeToday} className="btn-secondary text-sm">
              Bugün
            </button>
            <button type="button" onClick={setDateRangeLast7Days} className="btn-secondary text-sm">
              Son 7 Gün
            </button>
            <span className="text-text-secondary text-sm mr-2">Başlangıç:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input w-40"
            />
            <span className="text-text-secondary text-sm mr-2">Bitiş:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input w-40"
            />
          </div>
        </div>

        {canViewTemplates && (
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-2">PDF Şablonu (opsiyonel)</label>
            <select
              value={selectedTemplateId === '' ? '' : selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
              className="input w-full max-w-md"
            >
              <option value="">Varsayılan şablon</option>
              {reportTemplates.map((t) => (
                <option key={t.TemplateId} value={t.TemplateId}>
                  {t.TemplateName}
                  {t.IsDefault ? ' (Varsayılan)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={loadReport}
            disabled={!canFetch || loading}
            className="btn-primary"
          >
            {loading ? 'Yükleniyor...' : 'Raporu Getir'}
          </button>
          {canViewTemplates && (
            <button
              type="button"
              onClick={() => {
                loadReportTemplates();
                setShowManageTemplates(true);
              }}
              className="btn-secondary flex items-center gap-2"
            >
              <GearIcon size={18} weight="regular" />
              Rapor şablonlarını yönet
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card p-4 mb-3 border border-red-500/50 bg-red-500/10">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {data?.summary && (
        <div className="card p-4 mb-3">
          <h2 className="font-semibold mb-2">Özet</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {isSummaryCustomer(data.summary) && (
              <>
                <span className="text-text-secondary">Müşteri:</span>
                <span className="text-text-primary font-medium">{data.summary.customer_name}</span>
                <span className="text-text-secondary">Aktif sözleşme:</span>
                <span className="text-text-primary">{data.summary.total_active_contracts}</span>
              </>
            )}
            {isSummarySite(data.summary) && (
              <>
                <span className="text-text-secondary">Şantiye:</span>
                <span className="text-text-primary font-medium">{data.summary.site_name}</span>
                <span className="text-text-secondary">Müşteri:</span>
                <span className="text-text-primary">{data.summary.customer_name}</span>
                <span className="text-text-secondary">Aktif sözleşme:</span>
                <span className="text-text-primary">{data.summary.total_active_contracts}</span>
              </>
            )}
            {isSummaryGlobal(data.summary) && (
              <>
                <span className="text-text-secondary">Toplam müşteri:</span>
                <span className="text-text-primary">{data.summary.total_customers}</span>
                <span className="text-text-secondary">Toplam sözleşme:</span>
                <span className="text-text-primary">{data.summary.total_contracts}</span>
                <span className="text-text-secondary">Aktif sözleşme:</span>
                <span className="text-text-primary">{data.summary.total_active_contracts}</span>
              </>
            )}
          </div>
          {canFetchPdf && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-background-border">
              <button
                type="button"
                onClick={handlePdfPreview}
                disabled={pdfLoading}
                className="btn-secondary flex items-center gap-2"
              >
                <FilePdfIcon size={18} weight="regular" />
                {pdfLoading ? 'Hazırlanıyor...' : 'PDF Önizleme'}
              </button>
              <button
                type="button"
                onClick={handlePdfDownload}
                disabled={pdfLoading}
                className="btn-secondary flex items-center gap-2"
              >
                <FilePdfIcon size={18} weight="regular" />
                PDF İndir
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-secondary">
          Yükleniyor...
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={<ChartBarIcon size={48} weight="duotone" />}
          title="Rapor verisi bulunamadı"
          description="Seçilen kriterlere uygun hareket kaydı yok"
        />
      ) : data && data.items.length > 0 ? (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-420px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Ürün Adı
                  </th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Çıkan
                  </th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    İade
                  </th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">
                    Eldeki
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, index) => (
                  <tr
                    key={row.product_id}
                    className={`border-b border-background-border hover:bg-background-hover ${
                      index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'
                    }`}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                      {row.product_name}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary text-right">
                      {row.dispatched.toLocaleString('tr-TR')}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary text-right">
                      {row.returned.toLocaleString('tr-TR')}
                    </td>
                    <td className="py-0.5 px-2 align-middle text-text-primary text-right font-medium">
                      {row.current_on_site.toLocaleString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showManageTemplates && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]">
          <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[85vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-semibold mb-4">Rapor Şablonları</h2>
            <div className="flex-1 overflow-y-auto min-h-0">
              {reportTemplates.length === 0 ? (
                <p className="text-text-secondary text-sm">Henüz rapor şablonu yok.</p>
              ) : (
                <ul className="space-y-2">
                  {reportTemplates.map((t) => (
                    <li
                      key={t.TemplateId}
                      className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-background-hover border border-background-border"
                    >
                      <span className="text-text-primary font-medium truncate">{t.TemplateName}</span>
                      <div className="flex gap-1 shrink-0">
                        {canUpdateTemplate && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTemplate(t);
                              setIsNewTemplate(false);
                              setShowManageTemplates(false);
                            }}
                            className="p-2 rounded text-text-secondary hover:bg-background-border hover:text-text-primary"
                            title="Düzenle"
                          >
                            <PencilIcon size={18} weight="regular" />
                          </button>
                        )}
                        {canCreateTemplate && (
                          <button
                            type="button"
                            onClick={() => handleCopyTemplate(t)}
                            className="p-2 rounded text-text-secondary hover:bg-background-border hover:text-text-primary"
                            title="Kopyala"
                          >
                            <CopyIcon size={18} weight="regular" />
                          </button>
                        )}
                        {canDeleteTemplate && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(t)}
                            className="p-2 rounded text-text-secondary hover:text-red-400 hover:bg-red-500/10"
                            title="Sil"
                          >
                            <TrashIcon size={18} weight="regular" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-background-border">
              {canCreateTemplate && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTemplate(null);
                    setIsNewTemplate(true);
                    setShowManageTemplates(false);
                  }}
                  className="btn-primary"
                >
                  Yeni şablon
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManageTemplates(false)}
                className="btn-secondary ml-auto"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {(editingTemplate !== null || isNewTemplate) && (
        <ReportTemplateEditorModal
          template={editingTemplate}
          isNew={isNewTemplate}
          onClose={() => {
            setEditingTemplate(null);
            setIsNewTemplate(false);
            loadReportTemplates();
          }}
          onSave={(templateId) => {
            setEditingTemplate(null);
            setIsNewTemplate(false);
            loadReportTemplates();
            setSelectedTemplateId(templateId);
          }}
        />
      )}

      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title="Kiralama Hareket Raporu PDF"
        downloadFileName="kiralama-hareket-raporu.pdf"
        onClose={closePdfPreview}
      />
    </div>
  );
}
