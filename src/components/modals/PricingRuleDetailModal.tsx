import { useState, useEffect } from 'react';
import { PricingRule, PricingRuleType } from '../../models';
import { pricingRulesService } from '../../services/pricingRulesService';

interface PricingRuleTypeItem {
  Type: PricingRuleType;
  Name: string;
  Description: string;
}

const ruleTypes: PricingRuleTypeItem[] = [
  {
    Type: PricingRuleType.EarlyReturnMultiplier,
    Name: 'Erken İade Çarpanı',
    Description: 'Erken iade durumunda uygulanacak fiyat çarpanı',
  },
  {
    Type: PricingRuleType.LateReturnPenalty,
    Name: 'Geç İade Cezası',
    Description: 'Geç iade durumunda uygulanacak ceza çarpanı',
  },
  {
    Type: PricingRuleType.BulkDiscount,
    Name: 'Toplu Kiralama İndirimi',
    Description: 'Belirli miktarın üzerinde indirim yüzdesi',
  },
  {
    Type: PricingRuleType.LongTermDiscount,
    Name: 'Uzun Süreli İndirim',
    Description: 'Belirli gün sayısının üzerinde indirim yüzdesi',
  },
  {
    Type: PricingRuleType.MinimumRentalFee,
    Name: 'Minimum Kiralama Ücreti',
    Description: 'Minimum alınacak kiralama ücreti',
  },
];

interface PricingRuleDetailModalProps {
  rule: PricingRule | null;
  isNew: boolean;
  onClose: () => void;
}

export default function PricingRuleDetailModal({
  rule,
  isNew,
  onClose,
}: PricingRuleDetailModalProps) {
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<PricingRuleType>(PricingRuleType.EarlyReturnMultiplier);
  const [value, setValue] = useState(1.0);
  const [minDays, setMinDays] = useState<number | ''>('');
  const [maxDays, setMaxDays] = useState<number | ''>('');
  const [minQuantity, setMinQuantity] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (rule) {
      setRuleName(rule.RuleName);
      setRuleType(rule.RuleType);
      setValue(rule.Value);
      setMinDays(rule.MinDays ?? '');
      setMaxDays(rule.MaxDays ?? '');
      setMinQuantity(rule.MinQuantity ?? '');
      setDescription(rule.Description || '');
      setIsActive(rule.IsActive);
    }
  }, [rule]);

  const selectedRuleType = ruleTypes.find((rt) => rt.Type === ruleType);

  const getValueLabel = (): string => {
    switch (ruleType) {
      case PricingRuleType.EarlyReturnMultiplier:
      case PricingRuleType.LateReturnPenalty:
        return 'Çarpan';
      case PricingRuleType.BulkDiscount:
      case PricingRuleType.LongTermDiscount:
        return 'İndirim Yüzdesi';
      case PricingRuleType.MinimumRentalFee:
        return 'Minimum Tutar';
      default:
        return 'Değer';
    }
  };

  const getValueHint = (): string => {
    switch (ruleType) {
      case PricingRuleType.EarlyReturnMultiplier:
        return 'Örn: 1.2 = %20 fazla';
      case PricingRuleType.LateReturnPenalty:
        return 'Örn: 1.5 = %50 fazla';
      case PricingRuleType.BulkDiscount:
      case PricingRuleType.LongTermDiscount:
        return 'Örn: 10 = %10 indirim';
      case PricingRuleType.MinimumRentalFee:
        return 'Örn: 100.00 = ₺100.00';
      default:
        return '';
    }
  };

  const handleSave = async () => {
    if (!ruleName.trim()) {
      alert('Kural adı zorunludur');
      return;
    }

    try {
      setIsBusy(true);
      const data = {
        RuleName: ruleName,
        RuleType: ruleType,
        Value: value,
        MinDays: minDays === '' ? undefined : Number(minDays),
        MaxDays: maxDays === '' ? undefined : Number(maxDays),
        MinQuantity: minQuantity === '' ? undefined : Number(minQuantity),
        IsActive: isActive,
        Description: description || undefined,
      };

      if (isNew) {
        await pricingRulesService.createAsync(data);
      } else if (rule) {
        await pricingRulesService.updateAsync(rule.RuleId, data);
      }
      onClose();
    } catch (error) {
      console.error('Save pricing rule error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!rule || !confirm('Bu kuralı silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      setIsBusy(true);
      await pricingRulesService.deleteAsync(rule.RuleId);
      onClose();
    } catch (error) {
      console.error('Delete pricing rule error:', error);
      alert('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">
          {isNew ? 'Yeni Fiyatlandırma Kuralı' : 'Fiyatlandırma Kuralı Detayı'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Kural Adı *</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="Örn: Uzun Süreli Kiralama İndirimi"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Kural Türü *</label>
            <select
              value={ruleType}
              onChange={(e) => setRuleType(Number(e.target.value) as PricingRuleType)}
              className="input w-full"
            >
              {ruleTypes.map((rt) => (
                <option key={rt.Type} value={rt.Type}>
                  {rt.Name}
                </option>
              ))}
            </select>
            {selectedRuleType && (
              <div className="text-xs text-text-secondary mt-1">
                {selectedRuleType.Description}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{getValueLabel()} *</label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              min="0"
              step="0.1"
              className="input w-full"
            />
            <div className="text-xs text-text-secondary mt-1">{getValueHint()}</div>
          </div>

          <div className="card border-2 border-background-border p-4">
            <div className="text-sm font-medium mb-3">Koşullar (Opsiyonel)</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">Minimum Gün</label>
                <input
                  type="number"
                  value={minDays}
                  onChange={(e) => setMinDays(e.target.value === '' ? '' : Number(e.target.value))}
                  min="1"
                  placeholder="Yok"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Maksimum Gün</label>
                <input
                  type="number"
                  value={maxDays}
                  onChange={(e) => setMaxDays(e.target.value === '' ? '' : Number(e.target.value))}
                  min="1"
                  placeholder="Yok"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Minimum Miktar</label>
                <input
                  type="number"
                  value={minQuantity}
                  onChange={(e) =>
                    setMinQuantity(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  min="1"
                  placeholder="Yok"
                  className="input w-full"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bu kuralın ne işe yaradığını açıklayın..."
              className="input w-full h-20 resize-none"
            />
          </div>

          <div className="card border-2 border-background-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium mb-1">Kural Durumu</div>
                <div className="text-sm text-text-secondary">
                  Pasif kurallar fiyat hesaplamasında kullanılmaz
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{isActive ? 'Aktif' : 'Pasif'}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {!isNew && rule && (
            <button
              onClick={handleDelete}
              disabled={isBusy}
              className="btn-danger flex-1"
            >
              Sil
            </button>
          )}
          <button onClick={onClose} className="btn-secondary flex-1">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="btn-primary flex-1"
          >
            {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

