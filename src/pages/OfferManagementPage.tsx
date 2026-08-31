import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PercentIcon,
  PlusIcon,
  TagIcon,
} from '@phosphor-icons/react';
import { MaterialCategory } from '../models';
import { inventoryService } from '../services/inventoryService';
import { packageService } from '../services/packageService';
import { getApiErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';
import CategoryDiscountModal from '../components/modals/CategoryDiscountModal';
import QuotePackagesPage from './QuotePackagesPage';

type ManagementTab = 'categories' | 'packages';

const mainTabs: { id: ManagementTab; label: string; description: string }[] = [
  {
    id: 'categories',
    label: 'Kategori Yönetimi',
    description: 'Envanter ürün grupları ve kategori bazlı iskonto ayarları.',
  },
  {
    id: 'packages',
    label: 'Teklif Paketleri',
    description: 'Hazır ürün listelerini tekliflere tek tıkla uygulayın.',
  },
];

function CategoryBadge() {
  return (
    <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      Kategori
    </span>
  );
}

export default function OfferManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: ManagementTab = tabParam === 'packages' ? 'packages' : 'categories';
  const [activeTab, setActiveTab] = useState<ManagementTab>(initialTab);

  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [packageCount, setPackageCount] = useState(0);
  const [packagesLoading, setPackagesLoading] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedCategoryForDiscount, setSelectedCategoryForDiscount] = useState<MaterialCategory | null>(null);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  useEffect(() => {
    if (tabParam === 'templates') {
      navigate('/document-templates?tab=quote', { replace: true });
    }
  }, [navigate, tabParam]);

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const data = await inventoryService.getAllCategoriesAsync();
      setCategories(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadPackageCount = useCallback(async () => {
    try {
      setPackagesLoading(true);
      const data = await packageService.getAllAsync();
      setPackageCount(data.length);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setPackagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadPackageCount();
  }, [loadCategories, loadPackageCount]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLocaleLowerCase('tr-TR');
    if (!query) return categories;
    return categories.filter((category) => {
      const name = category.CategoryName.toLocaleLowerCase('tr-TR');
      const unit = (category.RentalUnit ?? '').toLocaleLowerCase('tr-TR');
      return name.includes(query) || unit.includes(query);
    });
  }, [categories, categorySearch]);

  const categorySummary = useMemo(() => {
    return `${categories.length} kategori`;
  }, [categories.length]);

  const packageSummary = useMemo(() => {
    return `${packageCount} paket`;
  }, [packageCount]);

  const handleTabChange = (nextTab: ManagementTab) => {
    setActiveTab(nextTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nextTab);
      return next;
    });
  };

  const openNewCategoryModal = () => {
    setSelectedCategory(null);
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (category: MaterialCategory) => {
    setSelectedCategory(category);
    setIsCategoryModalOpen(true);
  };

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setSelectedCategory(null);
    void loadCategories();
  };

  const openDiscountModal = (category: MaterialCategory) => {
    setSelectedCategoryForDiscount(category);
    setIsDiscountModalOpen(true);
  };

  const closeDiscountModal = () => {
    setIsDiscountModalOpen(false);
    setSelectedCategoryForDiscount(null);
  };

  const activeTabMeta = mainTabs.find((tab) => tab.id === activeTab)!;

  return (
    <div className="space-y-3">
      <div>
        <Link to="/system-settings" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeftIcon size={16} />
          Ayarlar&apos;a Dön
        </Link>
      </div>

      <section className="card p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Teklif Yönetimi</h2>
          <p className="text-sm text-text-secondary mt-1">
            Teklif hazırlığı için kategori ve paket ayarlarını tek merkezden yönetin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-white'
                  : 'bg-background-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
              {tab.id === 'categories' ? ` (${categories.length})` : ` (${packageCount})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-secondary">{activeTabMeta.description}</p>
      </section>

      {activeTab === 'categories' && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-text-secondary">{categorySummary}</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadCategories()}
                disabled={categoriesLoading}
              >
                Yenile
              </button>
              <button type="button" className="btn-primary" onClick={openNewCategoryModal}>
                <PlusIcon size={16} className="inline-block mr-1" />
                Yeni Kategori
              </button>
            </div>
          </div>

          {categories.length > 0 && (
            <div className="relative max-w-md">
              <MagnifyingGlassIcon
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                type="search"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Kategori veya birim ara..."
                className="input w-full pl-9 py-2 text-sm"
              />
            </div>
          )}

          {categoriesLoading ? (
            <div className="text-text-secondary">Kategoriler yükleniyor...</div>
          ) : categories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-background-border px-4 py-8 text-center text-sm text-text-secondary">
              Henüz kategori bulunmuyor. Ürün gruplarını düzenlemek için yeni kategori ekleyin.
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-background-border px-4 py-8 text-center text-sm text-text-secondary">
              Aramanızla eşleşen kategori bulunamadı.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredCategories.map((category) => (
                <div
                  key={category.CategoryId}
                  className="rounded-lg border border-background-border bg-background-panel p-3 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">{category.CategoryName}</span>
                      <CategoryBadge />
                    </div>
                    <div className="text-xs text-text-secondary">
                      Kiralama birimi: {category.RentalUnit?.trim() ? category.RentalUnit : '—'}
                    </div>
                    <div className="text-xs text-text-secondary">
                      Envanterde ürün gruplama ve teklif iskontosu için kullanılır
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                      onClick={() => openEditCategoryModal(category)}
                    >
                      <PencilSimpleIcon size={14} />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
                      onClick={() => openDiscountModal(category)}
                    >
                      <PercentIcon size={14} />
                      İndirim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'packages' && (
        <section className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-text-secondary">{packageSummary}</div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void loadPackageCount()}
              disabled={packagesLoading}
            >
              Yenile
            </button>
          </div>
          <QuotePackagesPage embedded onPackageCountChange={setPackageCount} />
        </section>
      )}

      <section className="card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background-hover text-text-secondary">
            <TagIcon size={18} />
          </span>
          <div className="text-sm text-text-secondary space-y-1">
            <p className="font-medium text-text-primary">Kullanım ipuçları</p>
            <p>
              <strong className="font-medium text-text-primary">Kategoriler</strong> envanterde ürün gruplamak ve
              kategori bazlı iskonto tanımlamak için kullanılır.
            </p>
            <p>
              <strong className="font-medium text-text-primary">Teklif paketleri</strong> sık kullanılan ürün
              listelerini kaydeder; teklif oluştururken hızlıca uygulanır.
            </p>
            <p>
              Teklif belge tasarımları için{' '}
              <Link to="/document-templates?tab=quote" className="text-primary hover:underline">
                Belge Şablonları
              </Link>{' '}
              sayfasını kullanın.
            </p>
          </div>
        </div>
      </section>

      {isCategoryModalOpen && (
        <CategoryDetailModal category={selectedCategory} categories={categories} onClose={closeCategoryModal} />
      )}

      {isDiscountModalOpen && selectedCategoryForDiscount && (
        <CategoryDiscountModal
          category={selectedCategoryForDiscount}
          onClose={closeDiscountModal}
          onSuccess={() => void loadCategories()}
        />
      )}
    </div>
  );
}
