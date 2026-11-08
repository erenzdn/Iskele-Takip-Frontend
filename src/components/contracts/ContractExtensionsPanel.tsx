import { useState, useEffect } from 'react';
import { CalendarIcon, ClockIcon, XCircleIcon } from '@phosphor-icons/react';
import { contractService } from '../../services/contractService';
import { ContractExtensionHistory, CreateExtensionRequest } from '../../models';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatShortDateTime } from '../../utils/formatters';
import { addCalendarDays, calendarDaysBetween, parseDateInput, todayDateInput } from '../../utils/dateInput';
import { useAuthStore } from '../../store/authStore';

function toDateKey(value: string | null | undefined): string {
  if (!value) return '';
  const day = value.split('T')[0];
  return parseDateInput(day) ? day : '';
}

interface ContractExtensionsPanelProps {
  contractId: number;
  contractCode?: string; // Şu an kullanılmıyor ama gelecekte başlıkta gösterilebilir
  currentPlannedEndDate: string | null; // Şu an kullanılmıyor ama doğrulama için kullanılabilir
  onExtensionCreated?: () => void;
}

export default function ContractExtensionsPanel({
  contractId,
  contractCode: _contractCode,
  currentPlannedEndDate,
  onExtensionCreated,
}: ContractExtensionsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ContractExtensionHistory | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [startDate, setStartDate] = useState(todayDateInput);
  const [endDate, setEndDate] = useState('');
  const [formData, setFormData] = useState<CreateExtensionRequest>({
    newPlannedEndDate: '',
    reason: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const user = useAuthStore((state) => state.user);
  const canExtendContract = Boolean(user?.permissions?.includes('contracts_extend'));

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await contractService.getExtensionsAsync(contractId);
      setHistory(data);
    } catch (error) {
      console.error('Load extensions error:', error);
      toast.error(getApiErrorMessage(error) || 'Uzatma geçmişi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const currentEndKey = toDateKey(history?.currentPlannedEndDate) || toDateKey(currentPlannedEndDate);
  const dayCount = calendarDaysBetween(startDate, endDate);

  const resetCreateForm = () => {
    setShowCreateForm(false);
    setStartDate(todayDateInput());
    setEndDate('');
    setFormData({ newPlannedEndDate: '', reason: '', notes: '' });
  };

  const handleStartDateChange = (nextStart: string) => {
    const currentDays = Number.isFinite(dayCount) && dayCount >= 1 ? dayCount : 0;
    setStartDate(nextStart);
    if (nextStart && currentDays >= 1) {
      setEndDate(addCalendarDays(nextStart, currentDays));
    }
  };

  const handleDurationDaysChange = (raw: string) => {
    const days = Math.floor(Number(raw));
    if (!startDate || !Number.isFinite(days) || days < 1) return;
    setEndDate(addCalendarDays(startDate, days));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endDate) {
      toast.error('Bitiş tarihi veya gün sayısı girin.');
      return;
    }
    if (startDate && calendarDaysBetween(startDate, endDate) < 1) {
      toast.error('Bitiş tarihi başlangıç tarihinden sonra olmalıdır.');
      return;
    }
    if (currentEndKey && calendarDaysBetween(currentEndKey, endDate) < 1) {
      toast.error(`Yeni bitiş, güncel bitişten (${formatDate(currentEndKey)}) sonra olmalıdır.`);
      return;
    }

    try {
      setSubmitting(true);
      const result = await contractService.createExtensionAsync(contractId, {
        ...formData,
        newPlannedEndDate: endDate,
      });
      toast.success(`Sözleşme ${result.extensionDays} gün uzatıldı!`);
      resetCreateForm();
      await loadHistory();
      onExtensionCreated?.();
    } catch (error) {
      console.error('Create extension error:', error);
      toast.error(getApiErrorMessage(error) || 'Uzatma oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (extensionId: number) => {
    const reason = prompt('İptal sebebini yazın:');
    if (!reason || reason.trim().length < 3) {
      toast.warning('İptal sebebi en az 3 karakter olmalıdır.');
      return;
    }

    try {
      setCancelling(extensionId);
      await contractService.cancelExtensionAsync(contractId, extensionId, { reason });
      toast.success('Uzatma iptal edildi.');
      await loadHistory();
      onExtensionCreated?.();
    } catch (error) {
      console.error('Cancel extension error:', error);
      toast.error(getApiErrorMessage(error) || 'Uzatma iptal edilemedi.');
    } finally {
      setCancelling(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    const key = toDateKey(dateString);
    const date = key ? parseDateInput(key) : new Date(dateString);
    if (!date || isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR');
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-text-secondary">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        <p className="mt-2">Yükleniyor...</p>
      </div>
    );
  }

  if (!history) {
    return (
      <div className="p-4 text-center text-text-secondary">
        Uzatma geçmişi yüklenemedi.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Özet Bilgi */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-background-elevated rounded-lg border border-background-border">
        <div>
          <div className="text-xs text-text-secondary mb-1">Orijinal Bitiş Tarihi</div>
          <div className="text-sm font-medium">{formatDate(history.originalPlannedEndDate)}</div>
        </div>
        <div>
          <div className="text-xs text-text-secondary mb-1">Güncel Bitiş Tarihi</div>
          <div className="text-sm font-medium text-primary">{formatDate(history.currentPlannedEndDate)}</div>
        </div>
        <div>
          <div className="text-xs text-text-secondary mb-1">Toplam Uzatma</div>
          <div className="text-sm font-medium">{history.totalExtensionDays} gün</div>
        </div>
        <div>
          <div className="text-xs text-text-secondary mb-1">Uzatma Sayısı</div>
          <div className="text-sm font-medium">{history.extensions.filter(e => e.status === 'active').length} aktif</div>
        </div>
      </div>

      {/* Yeni Uzatma Butonu */}
      {!showCreateForm && canExtendContract && (
        <button
          onClick={() => {
            setStartDate(todayDateInput());
            setEndDate('');
            setFormData({ newPlannedEndDate: '', reason: '', notes: '' });
            setShowCreateForm(true);
          }}
          className="btn-primary w-full py-2"
        >
          + Yeni Uzatma Ekle
        </button>
      )}

      {!canExtendContract && (
        <div className="text-center py-4 text-xs text-text-secondary">
          Uzatma oluşturmak için yetkiniz bulunmuyor.
        </div>
      )}

      {/* Yeni Uzatma Formu */}
      {showCreateForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-background-elevated rounded-lg border border-background-border space-y-3">
          <h4 className="text-sm font-semibold mb-3">Yeni Uzatma</h4>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Başlangıç</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="input w-full"
                disabled={submitting}
                title="Varsayılan bugünün tarihi. İsterseniz değiştirebilirsiniz."
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1" title="Başlangıç tarihine eklenen gün. Bitiş tarihi buna göre hesaplanır.">
                Gün
              </label>
              <input
                type="number"
                min={1}
                max={36500}
                step={1}
                value={Number.isFinite(dayCount) && dayCount >= 1 ? dayCount : ''}
                onChange={(e) => handleDurationDaysChange(e.target.value)}
                className="input w-full"
                placeholder="30"
                disabled={submitting}
                title="Örn. 30 yazınca bitiş tarihi otomatik gelir."
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                Bitiş <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                min={currentEndKey ? addCalendarDays(currentEndKey, 1) : undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="input w-full"
                disabled={submitting}
                title="Elle bitiş tarihi de girebilirsiniz; gün sayısı buna göre güncellenir."
              />
            </div>
          </div>

          <p className="text-xs text-text-secondary">
            Gün yazınca bitiş tarihi hesaplanır. Bitiş tarihini elle girerseniz gün sayısı güncellenir.
            {currentEndKey ? ` Güncel bitiş: ${formatDate(currentEndKey)}.` : ''}
          </p>
          {endDate && Number.isFinite(dayCount) && dayCount >= 1 && (
            <p className="text-xs text-text-primary">
              Yeni bitiş: {formatDate(endDate)} ({dayCount} gün)
            </p>
          )}
          {endDate && currentEndKey && calendarDaysBetween(currentEndKey, endDate) < 1 && (
            <p className="text-xs text-red-400">
              Yeni bitiş, güncel bitişten ({formatDate(currentEndKey)}) sonra olmalıdır.
            </p>
          )}

          <div>
            <label className="block text-xs text-text-secondary mb-1">Uzatma Sebebi</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="input w-full h-20 resize-none"
              placeholder="Örn: Proje süresi 3 ay uzadı"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input w-full h-20 resize-none"
              placeholder="Örn: Müşteri ile protokol yapıldı"
              disabled={submitting}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetCreateForm}
              className="btn-secondary flex-1"
              disabled={submitting}
            >
              İptal
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting}
            >
              {submitting ? 'Kaydediliyor...' : 'Uzat'}
            </button>
          </div>
        </form>
      )}

      {/* Uzatma Geçmişi */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Uzatma Geçmişi</h4>
        {history.extensions.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm">
            Henüz uzatma kaydı bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3">
            {history.extensions.map((ext) => (
              <div
                key={ext.extensionId}
                className={`p-3 rounded-lg border ${
                  ext.status === 'cancelled'
                    ? 'bg-background-secondary/30 border-background-border/50 opacity-60'
                    : 'bg-background-elevated border-background-border'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={16} className="text-text-secondary" />
                    <span className="text-sm font-medium">
                      {formatDate(ext.previousPlannedEndDate)} → {formatDate(ext.newPlannedEndDate)}
                    </span>
                    {ext.status === 'cancelled' && (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-900/40 text-red-200 border border-red-700/50">
                        İptal Edildi
                      </span>
                    )}
                  </div>
                  {ext.status === 'active' && canExtendContract && history.extensions.findIndex(e => e.extensionId === ext.extensionId) === history.extensions.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleCancel(ext.extensionId)}
                      disabled={cancelling === ext.extensionId}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                      title="Son uzatmayı iptal et"
                    >
                      <XCircleIcon size={16} />
                      {cancelling === ext.extensionId ? 'İptal ediliyor...' : 'İptal Et'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-text-secondary mb-2">
                  <div className="flex items-center gap-1">
                    <ClockIcon size={14} />
                    <span>+{ext.extensionDays} gün</span>
                  </div>
                  <div>
                    {ext.createdBy || '-'} • {formatShortDateTime(ext.createdAt)}
                  </div>
                </div>

                {ext.reason && (
                  <div className="text-xs text-text-primary mb-1">
                    <span className="text-text-secondary">Sebep:</span> {ext.reason}
                  </div>
                )}

                {ext.notes && (
                  <div className="text-xs text-text-secondary">
                    <span className="text-text-secondary">Not:</span> {ext.notes}
                  </div>
                )}

                {ext.status === 'cancelled' && ext.cancellationReason && (
                  <div className="mt-2 pt-2 border-t border-background-border text-xs text-red-300">
                    <span className="text-text-secondary">İptal sebebi:</span> {ext.cancellationReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
