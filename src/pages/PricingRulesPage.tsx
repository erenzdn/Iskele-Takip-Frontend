import { useState, useEffect } from 'react';
import { GearIcon, InfoIcon } from '@phosphor-icons/react';
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
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        <button onClick={loadRules} className="btn-secondary py-2 px-3 text-sm">Yenile</button>
        <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">+ Yeni Kural</button>
      </div>

      <div className="mb-2 rounded border border-background-border bg-blue-900/30 p-2 flex items-center gap-2">
        <InfoIcon size={18} weight="duotone" className="text-blue-300 shrink-0" aria-hidden />
        <span className="text-xs text-blue-200">Kurallar sözleşme fiyatı hesaplanırken otomatik uygulanır. Birden fazla kural aynı anda aktif olabilir.</span>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<GearIcon size={48} weight="duotone" />}
          title="Henüz fiyatlandırma kuralı bulunmuyor"
          description="Yeni bir kural ekleyerek başlayın"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-160px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kural Adı</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tür</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Değer</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Koşul</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, index) => (
                  <tr
                    key={rule.RuleId}
                    className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                    onClick={() => handleOpenDetail(rule)}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-text-primary">{rule.RuleName}</span>
                      {rule.Description && <span className="text-text-secondary ml-1 truncate max-w-xs inline-block align-bottom">— {rule.Description}</span>}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-600 text-white">{ruleTypeNames[rule.RuleType]}</span>
                    </td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0 text-green-500 font-medium">{formatRuleValue(rule)}</td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">{formatCondition(rule)}</td>
                    <td className="py-0.5 px-2 text-center align-middle">
                      <label className="flex items-center justify-center gap-1 cursor-pointer" onClick={(e) => handleToggleActive(rule, e)}>
                        <input type="checkbox" checked={rule.IsActive} onChange={() => {}} className="w-3.5 h-3.5" />
                        <span className="text-xs">{rule.IsActive ? 'Aktif' : 'Pasif'}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {rules.length} kural</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
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

