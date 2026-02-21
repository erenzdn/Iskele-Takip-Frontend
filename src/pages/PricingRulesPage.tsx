import { useState, useEffect } from 'react';
import { GearIcon } from '@phosphor-icons/react';
import { pricingRulesService } from '../services/pricingRulesService';
import { PricingRule, PricingRuleType } from '../models';
import EmptyState from '../components/EmptyState';
import PricingRuleDetailModal from '../components/modals/PricingRuleDetailModal';

const ruleTypeNames: Record<PricingRuleType, string> = {
  [PricingRuleType.EarlyReturnMultiplier]: 'Erken İade',
  [PricingRuleType.LateReturnPenalty]: 'Geç İade',
  [PricingRuleType.BulkDiscount]: 'Toplu İndirim',
  [PricingRuleType.LongTermDiscount]: 'Uzun Süre',
  [PricingRuleType.MinimumRentalFee]: 'Min. Ücret',
};

const formatRuleValue = (rule: PricingRule): string => {
  switch (rule.RuleType) {
    case PricingRuleType.EarlyReturnMultiplier:
    case PricingRuleType.LateReturnPenalty:
      return `x${rule.Value.toFixed(2)}`;
    case PricingRuleType.BulkDiscount:
    case PricingRuleType.LongTermDiscount:
      return `%${rule.Value.toFixed(0)}`;
    case PricingRuleType.MinimumRentalFee:
      return `₺${rule.Value.toFixed(2)}`;
    default:
      return rule.Value.toString();
  }
};

export default function PricingRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<PricingRule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewRule, setIsNewRule] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await pricingRulesService.getAllAsync();
      setRules(data);
    } catch (error) {
      console.error('Load pricing rules error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedRule(null);
    setIsNewRule(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (rule: PricingRule) => {
    setSelectedRule(rule);
    setIsNewRule(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRule(null);
    loadRules();
  };

  const handleToggleActive = async (rule: PricingRule, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await pricingRulesService.toggleActiveAsync(rule.RuleId, !rule.IsActive);
      loadRules();
    } catch (error) {
      console.error('Toggle active error:', error);
    }
  };

  const formatCondition = (rule: PricingRule): string => {
    const parts: string[] = [];
    if (rule.MinDays) parts.push(`${rule.MinDays}+ gün`);
    if (rule.MinQuantity) parts.push(`${rule.MinQuantity}+ adet`);
    return parts.length > 0 ? parts.join(' / ') : '-';
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Fiyatlandırma Kuralları</h1>
          <p className="text-text-secondary">Otomatik fiyat hesaplama kuralları</p>
        </div>
        <button onClick={handleAddNew} className="btn-primary">
          + Yeni Kural
        </button>
      </div>

      <div className="mb-6 card bg-blue-900 p-4 flex items-start gap-3">
        <span className="text-2xl">ℹ️</span>
        <div>
          <div className="font-semibold mb-1">Fiyatlandırma Kuralları Nasıl Çalışır?</div>
          <div className="text-sm opacity-90">
            Kurallar sözleşme fiyatı hesaplanırken otomatik olarak uygulanır. Birden fazla kural
            aynı anda aktif olabilir.
          </div>
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<GearIcon size={48} weight="duotone" />}
          title="Henüz fiyatlandırma kuralı bulunmuyor"
          description="Yeni bir kural ekleyerek başlayın"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full table-compact">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '40%' }}>
                    Kural Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '20%' }}>
                    Tür
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '15%' }}>
                    Değer
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '15%' }}>
                    Koşul
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '10%' }}>
                    Durum
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.RuleId}
                    className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                    onClick={() => handleOpenDetail(rule)}
                  >
                    <td className="p-4">
                      <div className="font-medium">{rule.RuleName}</div>
                      {rule.Description && (
                        <div className="text-sm text-text-secondary truncate max-w-md">
                          {rule.Description}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="badge bg-blue-600 text-white">
                        {ruleTypeNames[rule.RuleType]}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-green-500 font-bold">{formatRuleValue(rule)}</span>
                    </td>
                    <td className="p-4 text-center text-sm">{formatCondition(rule)}</td>
                    <td className="p-4 text-center">
                      <label
                        className="flex items-center justify-center gap-2 cursor-pointer"
                        onClick={(e) => handleToggleActive(rule, e)}
                      >
                        <input
                          type="checkbox"
                          checked={rule.IsActive}
                          onChange={() => {}}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{rule.IsActive ? 'Aktif' : 'Pasif'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <PricingRuleDetailModal
          rule={selectedRule}
          isNew={isNewRule}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

