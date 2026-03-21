import { useEffect, useMemo, useState } from 'react';
import { packageService } from '../services/packageService';
import { quoteService } from '../services/quoteService';
import { inventoryService } from '../services/inventoryService';
import { QuotePackage, QuotePackageDetail, Inventory, Quote } from '../models';
import { getApiErrorMessage } from '../utils/apiError';

type CreateMode = 'sourceQuote' | 'manual';

interface ManualItemState {
  productId: number | '';
  quantity: number;
}

export default function QuotePackagesPage() {
  const [packages, setPackages] = useState<QuotePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<QuotePackageDetail | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [packageName, setPackageName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultDiscount, setDefaultDiscount] = useState<number>(0);
  const [createMode, setCreateMode] = useState<CreateMode>('sourceQuote');
  const [sourceQuoteId, setSourceQuoteId] = useState<number | ''>('');
  const [manualItems, setManualItems] = useState<ManualItemState[]>([{ productId: '', quantity: 1 }]);

  const selectedPackageItems = useMemo(
    () => selectedPackage?.items ?? selectedPackage?.Items ?? [],
    [selectedPackage]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [packageData, quoteData, itemData] = await Promise.all([
        packageService.getAllAsync(),
        quoteService.getAllAsync(),
        inventoryService.getAllAsync(),
      ]);
      setPackages(packageData);
      setQuotes(quoteData);
      setInventoryItems(itemData);
    } catch (error) {
      alert(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectPackage = async (packageId: string | number) => {
    try {
      const detail = await packageService.getByIdAsync(packageId);
      setSelectedPackage(detail);
    } catch (error) {
      alert(getApiErrorMessage(error));
    }
  };

  const resetForm = () => {
    setPackageName('');
    setDescription('');
    setDefaultDiscount(0);
    setCreateMode('sourceQuote');
    setSourceQuoteId('');
    setManualItems([{ productId: '', quantity: 1 }]);
  };

  const handleCreate = async () => {
    if (!packageName.trim()) {
      alert('Paket adı zorunludur.');
      return;
    }
    if (createMode === 'sourceQuote' && !sourceQuoteId) {
      alert('Tekliften oluşturma için bir teklif seçin.');
      return;
    }
    if (createMode === 'manual') {
      const validItems = manualItems.filter((i) => i.productId && i.quantity > 0);
      if (validItems.length === 0) {
        alert('Manuel paket için en az bir ürün ekleyin.');
        return;
      }
    }

    try {
      setSaving(true);
      await packageService.createAsync({
        packageName: packageName.trim(),
        description: description.trim() || undefined,
        defaultDiscount: Number(defaultDiscount) || 0,
        sourceQuoteId: createMode === 'sourceQuote' ? Number(sourceQuoteId) : undefined,
        items:
          createMode === 'manual'
            ? manualItems
                .filter((i) => i.productId && i.quantity > 0)
                .map((i) => ({ productId: Number(i.productId), quantity: i.quantity }))
            : undefined,
      });
      resetForm();
      await loadData();
      alert('Paket oluşturuldu.');
    } catch (error) {
      alert(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (packageId: string | number) => {
    if (!window.confirm('Bu paketi silmek istediğinizden emin misiniz?')) return;
    try {
      await packageService.deleteAsync(packageId);
      if (selectedPackage?.PackageId === packageId) setSelectedPackage(null);
      await loadData();
    } catch (error) {
      alert(getApiErrorMessage(error));
    }
  };

  const updateManualItem = (index: number, patch: Partial<ManualItemState>) => {
    setManualItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Teklif Paketleri</h1>
        <button type="button" className="btn-secondary" onClick={loadData} disabled={loading}>
          Yenile
        </button>
      </div>

      <section className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Yeni Paket Oluştur</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="input"
            placeholder="Paket adı"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Açıklama (opsiyonel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="number"
            min={0}
            max={100}
            className="input"
            placeholder="Varsayılan iskonto (%)"
            value={defaultDiscount}
            onChange={(e) => setDefaultDiscount(Number(e.target.value) || 0)}
          />
          <select
            className="input"
            value={createMode}
            onChange={(e) => setCreateMode(e.target.value as CreateMode)}
          >
            <option value="sourceQuote">Tekliften Oluştur</option>
            <option value="manual">Manuel Ürün Listesi</option>
          </select>
        </div>

        {createMode === 'sourceQuote' ? (
          <select
            className="input w-full"
            value={sourceQuoteId}
            onChange={(e) => setSourceQuoteId(Number(e.target.value) || '')}
          >
            <option value="">Teklif seçin</option>
            {quotes.map((q) => (
              <option key={q.QuoteId} value={q.QuoteId}>
                #{q.QuoteId} - {q.QuoteCode || 'Kodsuz'} - {q.CustomerName || q.Customer?.Name || 'Müşteri'}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-2">
            {manualItems.map((item, index) => (
              <div key={index} className="grid md:grid-cols-[1fr_140px_100px] gap-2">
                <select
                  className="input"
                  value={item.productId}
                  onChange={(e) => updateManualItem(index, { productId: Number(e.target.value) || '' })}
                >
                  <option value="">Ürün seçin</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv.ItemId} value={inv.ItemId}>
                      {inv.ItemCode ? `${inv.ItemCode} - ` : ''}{inv.ItemName}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={item.quantity}
                  onChange={(e) => updateManualItem(index, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setManualItems((prev) => prev.filter((_, i) => i !== index))}
                  disabled={manualItems.length === 1}
                >
                  Kaldır
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setManualItems((prev) => [...prev, { productId: '', quantity: 1 }])}
            >
              + Ürün Satırı
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Paketi Kaydet'}
          </button>
          <button type="button" className="btn-secondary" onClick={resetForm}>
            Temizle
          </button>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Paket Listesi</h2>
          {loading ? (
            <div className="text-text-secondary">Yükleniyor...</div>
          ) : packages.length === 0 ? (
            <div className="text-text-secondary">Kayıtlı paket yok.</div>
          ) : (
            <div className="space-y-2">
              {packages.map((pkg) => (
                <div key={pkg.PackageId} className="border border-background-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-left flex-1"
                      type="button"
                      onClick={() => handleSelectPackage(pkg.PackageId)}
                    >
                      <div className="font-medium text-text-primary">{pkg.PackageName}</div>
                      <div className="text-xs text-text-secondary">
                        İskonto: %{pkg.DefaultDiscount ?? 0}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="btn-danger text-xs px-2 py-1"
                      onClick={() => handleDelete(pkg.PackageId)}
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Paket Detayı</h2>
          {!selectedPackage ? (
            <div className="text-text-secondary">Detay görmek için soldan bir paket seçin.</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="font-medium text-text-primary">{selectedPackage.PackageName}</div>
                <div className="text-xs text-text-secondary">{selectedPackage.Description || 'Açıklama yok'}</div>
              </div>
              <div className="text-xs text-text-secondary">Varsayılan iskonto: %{selectedPackage.DefaultDiscount ?? 0}</div>
              <div className="border border-background-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-background-hover">
                    <tr>
                      <th className="text-left px-2 py-1">Ürün</th>
                      <th className="text-right px-2 py-1">Miktar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPackageItems.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-text-secondary" colSpan={2}>
                          Ürün bilgisi bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      selectedPackageItems.map((item, idx) => (
                        <tr key={idx} className="border-t border-background-border">
                          <td className="px-2 py-1">{item.ItemName || `Ürün #${item.ProductId || item.ItemId || '-'}`}</td>
                          <td className="px-2 py-1 text-right">{item.Quantity}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

