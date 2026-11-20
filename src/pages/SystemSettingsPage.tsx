import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowRightIcon,
  CircleNotchIcon,
  ColumnsIcon,
  DownloadSimpleIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  PaletteIcon,
  UserIcon,
  UsersThreeIcon,
  XIcon,
  MoonIcon,
  SunIcon,
  WarningIcon,
  ShieldCheckIcon,
  CurrencyCircleDollar,
  Gear,
  TrashIcon,
  PlusIcon,
  FileTextIcon,
  PackageIcon,
  TagIcon,
  RulerIcon,
} from '@phosphor-icons/react';
import ConfirmModal from '../components/modals/ConfirmModal';
import DocumentCategoryManagerPanel from '../components/documentCategories/DocumentCategoryManagerPanel';
import { useDocumentCategoryStore } from '../services/documentCategoryService';
import { adminService } from '../services/adminService';
import { inventoryService, ExchangeRateResponse, PricingPresetResponse } from '../services/inventoryService';
import { useAuthStore } from '../store/authStore';
import { useArchivePreferencesStore } from '../store/archivePreferencesStore';
import { useTableColumnPreferencesStore } from '../store/tableColumnPreferencesStore';
import { useTableLayoutStore } from '../store/tableLayoutStore';
import { buildColumnIds, resolveColumnOrder } from '../utils/tableLayout';
import { useThemeStore } from '../store/themeStore';
import { isAdminUser } from '../utils/authHelpers';
import type { LiveExchangeRatesResult } from '../types/electron';
import { useUpdateStore } from '../store/updateStore';
import { toast } from '../hooks/useToast';
import { unitService } from '../services/unitService';
import { Unit } from '../models';
import {
  CUSTOMER_TABLE_COLUMNS,
  INVENTORY_TABLE_COLUMNS,
  getVisibleColumnWidths,
  type CustomerColumnKey,
  type InventoryColumnKey,
  type TableColumnMeta,
} from '../constants/tableColumns';
import packageJson from '../../package.json';

type InventoryMockRow = Record<InventoryColumnKey, ReactNode>;
type CustomerMockRow = Record<CustomerColumnKey, ReactNode>;

const INVENTORY_PREVIEW_ROWS: InventoryMockRow[] = [
  {
    itemCode: <span className="font-mono text-[11px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded">ISK-120</span>,
    itemName: 'Cuplock Dikey 3.00 m',
    weight: '12.4 kg',
    unit: 'adet',
    monthlyListPrice: <span className="text-success">₺185,00</span>,
    unitPriceTry: <span className="text-info">₺1.250,00</span>,
    unitPriceUsd: <span className="text-info">$38,00</span>,
    unitPriceEur: <span className="text-info">€35,00</span>,
    status: <span className="inline-flex rounded-badge bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Stokta</span>,
    audit: 'Ahmet Yılmaz • 12.03.2026 14:22',
  },
  {
    itemCode: <span className="font-mono text-[11px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded">ISK-245</span>,
    itemName: 'H Tipi Diyagonal 2.00 m',
    weight: '8.1 kg',
    unit: 'adet',
    monthlyListPrice: <span className="text-success">₺96,00</span>,
    unitPriceTry: <span className="text-info">₺640,00</span>,
    unitPriceUsd: <span className="text-info">$19,50</span>,
    unitPriceEur: <span className="text-info">€18,00</span>,
    status: <span className="inline-flex rounded-badge bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">Kiralıkta</span>,
    audit: 'Ayşe Demir • 04.02.2026 09:10',
  },
  {
    itemCode: <span className="font-mono text-[11px] font-medium text-primary bg-primary/10 px-1 py-0.5 rounded">ISK-318</span>,
    itemName: 'Platform 0.32 × 2.50 m',
    weight: '18.6 kg',
    unit: 'adet',
    monthlyListPrice: <span className="text-success">₺210,00</span>,
    unitPriceTry: <span className="text-info">₺1.480,00</span>,
    unitPriceUsd: <span className="text-info">$45,00</span>,
    unitPriceEur: <span className="text-info">€41,50</span>,
    status: <span className="inline-flex rounded-badge bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">Kritik</span>,
    audit: 'Mehmet Kaya • 28.01.2026 16:45',
  },
];

const CUSTOMER_PREVIEW_ROWS: CustomerMockRow[] = [
  {
    id: '#1042',
    name: 'Anadolu İnşaat A.Ş.',
    phone: '0532 111 22 33',
    taxId: '1234567890',
    email: 'info@anadoluinsaat.com',
    preferredContact: 'Ali Veli • 0533 444 55 66',
    contracts: '4',
    audit: 'Admin • 10.01.2026 11:05',
  },
  {
    id: '#1088',
    name: 'Marmara Yapı Ltd.',
    phone: '0216 555 01 02',
    taxId: '9876543210',
    email: 'teklif@marmarayapi.com',
    preferredContact: 'Zeynep Ak • 0530 777 88 99',
    contracts: '2',
    audit: 'Ayşe Demir • 18.02.2026 13:40',
  },
  {
    id: '#1120',
    name: 'Ege İskele Sistemleri',
    phone: '0232 300 40 50',
    taxId: '4567891230',
    email: 'operasyon@egeiskele.com',
    preferredContact: 'Can Öztürk',
    contracts: '7',
    audit: 'Ahmet Yılmaz • 05.03.2026 08:15',
  },
];

function ColumnPreviewTable<TKey extends string>({
  columns,
  visibility,
  tableId,
  rows,
  emptyHint,
}: {
  columns: TableColumnMeta<TKey>[];
  visibility: Record<TKey, boolean>;
  /** Asıl tablonun DataTable kimliği: önizleme kullanıcının sütun sırasını yansıtır. */
  tableId: string;
  rows: Array<Record<TKey, ReactNode>>;
  emptyHint: string;
}) {
  const savedOrder = useTableLayoutStore((s) => s.layouts[tableId]?.order);
  const visibleColumns = useMemo(() => {
    const visible = columns.filter((col) => visibility[col.key]);
    const ids = buildColumnIds(visible.map((col) => col.label));
    const ordered = resolveColumnOrder(ids, savedOrder);
    return ordered.map((id) => visible[ids.indexOf(id)]);
  }, [columns, visibility, savedOrder]);
  const widths = useMemo(
    () => getVisibleColumnWidths(columns, visibility),
    [columns, visibility]
  );

  if (visibleColumns.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-background-border px-4 py-8 text-center text-sm text-text-secondary">
        {emptyHint}
      </div>
    );
  }

  const alignClass = (align: TableColumnMeta<TKey>['align']) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          Canlı önizleme
        </p>
        <p className="text-[11px] text-text-secondary">Örnek veriler • gerçek kayıt değildir</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-background-border bg-background-panel">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs border-collapse text-text-primary">
            <thead className="border-b border-background-border">
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`${alignClass(col.align)} py-1.5 px-2 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate`}
                    style={{ width: `${widths[col.key] ?? 0}%` }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-t border-background-border/60 hover:bg-background-hover/40"
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`${alignClass(col.align)} py-2 px-2 align-middle border-r border-background-border/60 last:border-r-0 truncate ${
                        col.key === 'name' || col.key === 'itemName' ? 'font-medium text-text-primary' : ''
                      } ${col.key === 'audit' || col.key === 'id' ? 'text-text-secondary' : ''}`}
                    >
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type StatusMessage = { type: 'success' | 'error'; text: string } | null;

const LAST_BACKUP_AT_KEY = 'system_last_backup_at';
const LAST_AUTO_BACKUP_AT_KEY = 'system_last_auto_backup_at';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function buildBackupFilename(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `iskele-backup-${y}${m}${d}-${hh}${mm}${ss}.sql.gz`;
}

function formatTrDateTime(raw?: unknown) {
  if (raw === undefined || raw === null) return '-';
  const iso = String(raw).trim();
  if (!iso) return '-';

  if (/^\d+$/.test(iso)) {
    const n = Number(iso);
    const dt = new Date(n < 1e12 ? n * 1000 : n);
    if (!Number.isNaN(dt.getTime())) {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(dt);
    }
  }

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(dt);
}

type SettingsTab = 'appearance' | 'columns' | 'inventory' | 'documents' | 'finance' | 'system';

type SettingsScope = 'personal' | 'company' | 'system';

const TABS: { id: SettingsTab; label: string; description: string; icon: ReactNode; scope: SettingsScope }[] = [
  {
    id: 'appearance',
    label: 'Görünüm',
    description: 'Tema ve arşiv kayıtları',
    icon: <PaletteIcon size={18} weight="duotone" />,
    scope: 'personal',
  },
  {
    id: 'columns',
    label: 'Tablo Sütunları',
    description: 'Envanter ve müşteri listeleri',
    icon: <ColumnsIcon size={18} weight="duotone" />,
    scope: 'personal',
  },
  {
    id: 'inventory',
    label: 'Ürün ve Envanter',
    description: 'Birimler ve ürün kategorileri',
    icon: <PackageIcon size={18} weight="duotone" />,
    scope: 'company',
  },
  {
    id: 'documents',
    label: 'Teklif ve Sözleşme',
    description: 'Kategoriler, şablonlar, paketler',
    icon: <FileTextIcon size={18} weight="duotone" />,
    scope: 'company',
  },
  {
    id: 'finance',
    label: 'Kur ve Oranlar',
    description: 'Döviz kuru ve kiralama oranı',
    icon: <CurrencyCircleDollar size={18} weight="duotone" />,
    scope: 'company',
  },
  {
    id: 'system',
    label: 'Güncelleme ve Yedek',
    description: 'Yazılım sürümü ve veritabanı yedeği',
    icon: <Gear size={18} weight="duotone" />,
    scope: 'system',
  },
];

const TAB_GROUPS: { scope: SettingsScope; label: string }[] = [
  { scope: 'personal', label: 'Kişisel Tercihler' },
  { scope: 'company', label: 'Şirket Tanımları' },
  { scope: 'system', label: 'Sistem' },
];

const SCOPE_NOTES: Record<SettingsScope, { icon: ReactNode; text: string }> = {
  personal: {
    icon: <UserIcon size={14} weight="bold" />,
    text: 'Bu ayarlar yalnızca sizin için, bu bilgisayarda saklanır.',
  },
  company: {
    icon: <UsersThreeIcon size={14} weight="bold" />,
    text: 'Bu ayarlar tüm kullanıcılar için geçerlidir.',
  },
  system: {
    icon: <Gear size={14} weight="bold" />,
    text: 'Uygulama sürümü ve veritabanı yedekleri.',
  },
};

/** Eski sekme kimlikleri (?tab=general vb.) yeni yapıya yönlenir. */
const LEGACY_TAB_MAP: Record<string, SettingsTab> = {
  general: 'appearance',
  archives: 'appearance',
  tables: 'columns',
  categories: 'documents',
};

function resolveTabParam(raw: string | null): SettingsTab {
  if (!raw) return 'appearance';
  if (TABS.some((t) => t.id === raw)) return raw as SettingsTab;
  return LEGACY_TAB_MAP[raw] ?? 'appearance';
}

type SettingsEntry = {
  /** SettingsSection id'si; aramadan seçilince bu bölüme kaydırılır. */
  id: string;
  tab: SettingsTab;
  title: string;
  description: string;
  keywords: string;
};

const SETTINGS_INDEX: SettingsEntry[] = [
  {
    id: 'theme',
    tab: 'appearance',
    title: 'Tema',
    description: 'Aydınlık veya koyu arayüz teması',
    keywords: 'karanlık koyu açık aydınlık dark light mod renk görünüm',
  },
  {
    id: 'archive-visibility',
    tab: 'appearance',
    title: 'Arşiv kayıtları',
    description: 'Pasif depoları ve arşivlenmiş ürünleri listelerde göster',
    keywords: 'arşiv pasif depo ürün gizle göster görünürlük envanter malzeme kartı',
  },
  {
    id: 'inventory-columns',
    tab: 'columns',
    title: 'Envanter tablosu sütunları',
    description: 'Envanter listesinde görünen sütunlar',
    keywords: 'tablo sütun kolon envanter ürün fiyat ağırlık kod birim liste',
  },
  {
    id: 'customer-columns',
    tab: 'columns',
    title: 'Müşteri tablosu sütunları',
    description: 'Müşteri listesinde görünen sütunlar',
    keywords: 'tablo sütun kolon müşteri cari telefon vergi e-posta liste',
  },
  {
    id: 'units',
    tab: 'inventory',
    title: 'Birim tanımları',
    description: 'Adet, ton, paket gibi ölçü birimleri',
    keywords: 'birim ölçü adet kg ton metre paket koli ekle sil',
  },
  {
    id: 'product-categories',
    tab: 'inventory',
    title: 'Ürün kategorileri',
    description: 'Envanter ürün grupları ve kategori iskontoları',
    keywords: 'ürün kategori grup iskonto indirim envanter',
  },
  {
    id: 'document-categories',
    tab: 'documents',
    title: 'Teklif ve sözleşme kategorileri',
    description: 'Teklif ve sözleşmeleri gruplamak için kategoriler',
    keywords: 'kategori etiket teklif sözleşme grup filtre',
  },
  {
    id: 'document-templates',
    tab: 'documents',
    title: 'Belge şablonları',
    description: 'Teklif, sözleşme ve kullanım ekstresi şablonları',
    keywords: 'şablon belge pdf çıktı yazdır teklif sözleşme ekstre extre tasarım antet',
  },
  {
    id: 'offer-packages',
    tab: 'documents',
    title: 'Teklif paketleri',
    description: 'Hazır ürün listeleri',
    keywords: 'paket teklif hazır liste ürün',
  },
  {
    id: 'exchange-rates',
    tab: 'finance',
    title: 'Döviz kurları',
    description: 'Uygulamada kullanılan USD ve EUR kurları',
    keywords: 'döviz kur dolar euro usd eur para birimi tcmb',
  },
  {
    id: 'rental-rates',
    tab: 'finance',
    title: 'Kiralama oranı ön ayarı',
    description: 'Para birimine göre varsayılan kiralama çarpanları',
    keywords: 'kira kiralama oran yüzde çarpan fiyat aylık tl usd eur',
  },
  {
    id: 'software-update',
    tab: 'system',
    title: 'Yazılım güncelleme',
    description: 'Yeni sürümü denetle, indir ve yükle',
    keywords: 'güncelleme sürüm versiyon yükle indir update',
  },
  {
    id: 'backup',
    tab: 'system',
    title: 'Veritabanı yedeği',
    description: 'Manuel yedek al, son yedek tarihleri',
    keywords: 'yedek yedekleme backup veritabanı sql indir',
  },
];

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const SEARCH_HAYSTACK = new Map(
  SETTINGS_INDEX.map((entry) => {
    const tab = TABS.find((t) => t.id === entry.tab);
    return [
      entry.id,
      normalizeSearch([entry.title, entry.description, entry.keywords, tab?.label, tab?.description].join(' ')),
    ];
  })
);

function searchSettings(query: string): SettingsEntry[] {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return SETTINGS_INDEX.filter((entry) => {
    const hay = SEARCH_HAYSTACK.get(entry.id) ?? '';
    return tokens.every((token) => hay.includes(token));
  });
}

const HighlightContext = createContext<string | null>(null);

function SettingsSection({
  id,
  icon,
  title,
  description,
  action,
  children,
  className = '',
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const highlighted = useContext(HighlightContext) === id && id != null;
  return (
    <section
      id={id ? `settings-${id}` : undefined}
      className={`scroll-mt-4 rounded-panel border bg-background-panel overflow-hidden transition-shadow duration-500 ${
        highlighted ? 'border-primary/60 ring-2 ring-primary/30' : 'border-background-border'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-background-border/70 bg-background-elevated/40">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-text-secondary leading-relaxed">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="p-5">{children}</div> : null}
    </section>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="group flex items-center justify-between gap-4 rounded-xl border border-background-border/80 bg-background-elevated/30 px-4 py-3.5 cursor-pointer select-none transition-colors hover:border-primary/30 hover:bg-background-elevated/60">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{title}</span>
        <span className="block text-xs text-text-secondary mt-0.5 leading-relaxed">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-background-hover border border-background-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

function DocumentCategoriesSettings() {
  const count = useDocumentCategoryStore((s) => s.categories.length);
  const loaded = useDocumentCategoryStore((s) => s.loaded);
  return (
    <SettingsSection
      id="document-categories"
      icon={<TagIcon size={18} weight="duotone" />}
      title="Teklif ve Sözleşme Kategorileri"
      description="Tekliflerinizi ve sözleşmelerinizi gruplamak için kategoriler oluşturun. Kategoriler teklif ve sözleşmelerde ortaktır; teklif sözleşmeye dönüşünce kategorileri de taşınır. Listelerde Kategori filtresiyle hızlıca arayabilirsiniz."
      action={
        loaded ? (
          <span className="inline-flex items-center rounded-lg border border-background-border bg-background-elevated/60 px-2.5 py-1 text-xs font-medium text-text-secondary">
            {count} kategori
          </span>
        ) : null
      }
    >
      <DocumentCategoryManagerPanel />
      <p className="mt-4 text-[11px] text-text-secondary/80 leading-relaxed">
        Bir teklife veya sözleşmeye kategori atamak için listede Kategori sütununa tıklayın, satıra sağ tıklayıp
        "Kategorileri Düzenle"yi seçin ya da kaydın detayındaki başlıktan düzenleyin. Silinen bir kategori yalnızca
        kayıtların üzerinden kaldırılır; teklif ve sözleşmeler silinmez.
      </p>
    </SettingsSection>
  );
}

function LinkCard({
  to,
  icon,
  title,
  description,
  tone = 'primary',
}: {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
  tone?: 'primary' | 'info';
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 rounded-xl border border-background-border bg-background-elevated/30 px-4 py-3.5 transition-colors hover:border-primary/35 hover:bg-primary/5"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            tone === 'info' ? 'bg-info/10 text-info' : 'bg-primary/10 text-primary'
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text-primary">{title}</span>
          <span className="block text-xs text-text-secondary mt-0.5">{description}</span>
        </span>
      </span>
      <ArrowRightIcon
        size={16}
        className="shrink-0 text-text-secondary opacity-60 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-hover:text-primary"
      />
    </Link>
  );
}

function ColumnToggleChips<TKey extends string>({
  columns,
  visibility,
  onToggle,
}: {
  columns: TableColumnMeta<TKey>[];
  visibility: Record<TKey, boolean>;
  onToggle: (key: TKey, visible: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {columns.map((col) => {
        const required = Boolean(col.required);
        const checked = visibility[col.key];
        return (
          <label
            key={col.key}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm select-none transition-colors ${
              required
                ? 'cursor-not-allowed border-primary/25 bg-primary/10 text-primary'
                : checked
                  ? 'cursor-pointer border-primary/35 bg-primary/10 text-primary'
                  : 'cursor-pointer border-background-border bg-background-elevated/40 text-text-secondary hover:border-primary/25 hover:text-text-primary'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={required}
              onChange={(e) => onToggle(col.key, e.target.checked)}
              className="sr-only"
            />
            <span className={`h-1.5 w-1.5 rounded-full ${checked || required ? 'bg-primary' : 'bg-background-border-strong'}`} />
            {col.label}
            {required ? <span className="text-[10px] opacity-70">zorunlu</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-background-border/70 bg-background-elevated/40 px-3.5 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-text-secondary font-medium">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

export default function SystemSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTabParam(searchParams.get('tab'));
  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const [query, setQuery] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResults = useMemo(() => searchSettings(query), [query]);
  const searching = query.trim().length > 0;
  const matchCountByTab = useMemo(() => {
    const counts = new Map<SettingsTab, number>();
    for (const r of searchResults) counts.set(r.tab, (counts.get(r.tab) ?? 0) + 1);
    return counts;
  }, [searchResults]);

  const openSetting = useCallback(
    (entry: SettingsEntry) => {
      setQuery('');
      setActiveTab(entry.tab);
      setHighlightId(entry.id);
      // Sekme içeriği render edildikten sonra bölüme kaydır.
      window.setTimeout(() => {
        document.getElementById(`settings-${entry.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    },
    [setActiveTab]
  );

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const showArchivedWarehouses = useArchivePreferencesStore((s) => s.showArchivedWarehouses);
  const showArchivedInventory = useArchivePreferencesStore((s) => s.showArchivedInventory);
  const setShowArchivedWarehouses = useArchivePreferencesStore((s) => s.setShowArchivedWarehouses);
  const setShowArchivedInventory = useArchivePreferencesStore((s) => s.setShowArchivedInventory);
  const inventoryColumns = useTableColumnPreferencesStore((s) => s.inventory);
  const customerColumns = useTableColumnPreferencesStore((s) => s.customers);
  const setInventoryColumnVisible = useTableColumnPreferencesStore((s) => s.setInventoryColumnVisible);
  const setCustomerColumnVisible = useTableColumnPreferencesStore((s) => s.setCustomerColumnVisible);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(
    () => localStorage.getItem(LAST_BACKUP_AT_KEY)
  );
  const [lastAutoBackupAt, setLastAutoBackupAt] = useState<string | null>(
    () => localStorage.getItem(LAST_AUTO_BACKUP_AT_KEY)
  );
  const [backupStatusError, setBackupStatusError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  const [usdRate, setUsdRate] = useState<number | ''>('');
  const [eurRate, setEurRate] = useState<number | ''>('');
  const [exchangeNotes, setExchangeNotes] = useState('');
  const [activeRates, setActiveRates] = useState<ExchangeRateResponse | null>(null);
  const [liveRates, setLiveRates] = useState<Extract<LiveExchangeRatesResult, { ok: true }> | null>(null);
  const [liveRatesError, setLiveRatesError] = useState<string | null>(null);
  const [liveRatesLoading, setLiveRatesLoading] = useState(false);

  const [rentalRateTry, setRentalRateTry] = useState<number | ''>('');
  const [rentalRateUsd, setRentalRateUsd] = useState<number | ''>('');
  const [rentalRateEur, setRentalRateEur] = useState<number | ''>('');
  const [presetNotes, setPresetNotes] = useState('');
  const [activePreset, setActivePreset] = useState<PricingPresetResponse | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [newUnitName, setNewUnitName] = useState('');
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [busyUnits, setBusyUnits] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);

  const {
    isUpdateAvailable,
    isDownloading,
    isDownloaded,
    isChecking,
    progress: updateProgress,
    updateInfo,
    error: updateError,
  } = useUpdateStore();

  const updateStatus = useMemo(() => {
    if (updateError) return 'error';
    if (isChecking) return 'checking';
    if (isDownloaded) return 'downloaded';
    if (isDownloading) return 'downloading';
    if (isUpdateAvailable) return 'available';
    return 'uptodate';
  }, [isUpdateAvailable, isDownloading, isDownloaded, isChecking, updateError]);

  const confirmMessage = useMemo(() => {
    return [
      'Bu işlem veritabanının tam yedeğini alır ve `.sql.gz` dosyası olarak indirir.',
      'Saatte en fazla 1 kez manuel yedek alınabilir (rate limit).',
      'İndirme birkaç saniye sürebilir.',
      '',
      'Devam etmek istiyor musunuz?',
    ].join('\n');
  }, []);

  const activeTabMeta = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  useEffect(() => {
    let mounted = true;
    const fetchBackupStatus = async () => {
      try {
        setBackupStatusError(null);
        const statusInfo = await adminService.getSystemBackupStatusAsync();
        if (!mounted || !statusInfo) return;

        if (statusInfo.lastManualBackupAt) {
          setLastBackupAt(statusInfo.lastManualBackupAt);
          localStorage.setItem(LAST_BACKUP_AT_KEY, statusInfo.lastManualBackupAt);
        }
        if (statusInfo.lastAutoBackupAt) {
          setLastAutoBackupAt(statusInfo.lastAutoBackupAt);
          localStorage.setItem(LAST_AUTO_BACKUP_AT_KEY, statusInfo.lastAutoBackupAt);
        }
      } catch (err) {
        console.warn('Backup status alınamadı:', err);
        if (!mounted) return;
        const statusCode = (err as { status?: number })?.status;
        if (statusCode === 403) {
          setBackupStatusError('Yedek durumu yalnızca admin yetkisiyle görüntülenebilir.');
        } else {
          setBackupStatusError('Son yedek bilgisi sunucudan alınamadı.');
        }
      }
    };
    fetchBackupStatus();

    return () => {
      mounted = false;
    };
  }, []);

  const loadLiveRates = useCallback(async () => {
    const fetcher = window.electron?.getLiveExchangeRates;
    if (!fetcher) {
      setLiveRatesError('Güncel kur yalnızca masaüstü uygulamasında gösterilir.');
      return;
    }
    try {
      setLiveRatesLoading(true);
      setLiveRatesError(null);
      const result = await fetcher();
      if (result.ok) {
        setLiveRates(result);
      } else {
        setLiveRates(null);
        setLiveRatesError(result.error || 'Güncel kur alınamadı.');
      }
    } catch (err) {
      console.warn('Güncel kur alınamadı:', err);
      setLiveRates(null);
      setLiveRatesError('Güncel kur alınamadı.');
    } finally {
      setLiveRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'finance') return;
    void loadLiveRates();
  }, [activeTab, loadLiveRates]);

  useEffect(() => {
    const fetchRatesAndPresets = async () => {
      try {
        const rates = await inventoryService.getExchangeRatesAsync();
        setActiveRates(rates);
        setUsdRate(rates.UsdRate);
        setEurRate(rates.EurRate);
        setExchangeNotes(rates.Notes || '');
      } catch (err) {
        console.warn('Döviz kurları alınamadı:', err);
      }

      try {
        const preset = await inventoryService.getPricingPresetAsync();
        setActivePreset(preset);
        setRentalRateTry(preset.RentalRateTry != null ? preset.RentalRateTry * 100 : '');
        setRentalRateUsd(preset.RentalRateUsd != null ? preset.RentalRateUsd * 100 : '');
        setRentalRateEur(preset.RentalRateEur != null ? preset.RentalRateEur * 100 : '');
        setPresetNotes(preset.Notes || '');
      } catch (err) {
        console.warn('Kiralama oranları alınamadı:', err);
      }
    };
    fetchRatesAndPresets();
  }, []);

  useEffect(() => {
    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        const data = await unitService.getAllAsync();
        setUnits(data);
      } catch (error) {
        console.error('Load units error:', error);
        toast.error('Birimler yüklenemedi.');
      } finally {
        setLoadingUnits(false);
      }
    };
    loadUnits();
  }, []);

  const downloadBlobAsFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      window.URL.revokeObjectURL(url);
    }
  };

  const normalizeErrorMessage = (err: unknown): StatusMessage => {
    const anyErr = err as any;
    const statusCode: number | undefined = anyErr?.status;
    const responseText: string | undefined = anyErr?.responseText;
    const message: string = anyErr?.message ?? '';

    if (!statusCode && /Failed to fetch|NetworkError/i.test(message)) {
      return {
        type: 'error',
        text: 'Yedek hazırlanırken sunucu ile bağlantı kesildi.',
      };
    }

    if (statusCode === 403) {
      return { type: 'error', text: 'Bu işlem sadece admin yetkisine sahip kullanıcılar tarafından yapılabilir.' };
    }
    if (statusCode === 429) {
      return { type: 'error', text: 'Saatte sadece 1 kez manuel yedek alabilirsiniz.' };
    }

    if (responseText) {
      return { type: 'error', text: responseText };
    }
    return { type: 'error', text: 'Yedekleme sırasında bir hata oluştu.' };
  };

  const handleConfirm = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const blob = await adminService.downloadSystemBackupAsync();
      const now = new Date();
      const filename = buildBackupFilename(now);
      downloadBlobAsFile(blob, filename);

      const iso = now.toISOString();
      setLastBackupAt(iso);
      localStorage.setItem(LAST_BACKUP_AT_KEY, iso);
      setStatus({ type: 'success', text: 'Yedek başarıyla indirildi.' });
      setConfirmOpen(false);
    } catch (e) {
      console.error('Backup error:', e);
      setStatus(normalizeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckUpdates = () => {
    if (!window.electron?.updates) {
      toast.error('Güncelleme yalnızca kurulu masaüstü uygulamasında çalışır.');
      return;
    }
    useUpdateStore.getState().setChecking(true);
    toast.info('Güncelleme kontrol ediliyor...');
    window.electron.updates.checkForUpdates();
  };

  const handleDownload = () => {
    if (window.electron) {
      window.electron.updates.startDownload();
    }
  };

  const handleInstall = () => {
    if (window.electron) {
      setIsInstalling(true);
      window.electron.updates.installUpdate();
    }
  };

  const handleSaveRates = async () => {
    if (usdRate === '' || eurRate === '') {
      toast.warning('USD ve EUR kurları zorunludur.');
      return;
    }
    try {
      setBusy(true);
      await inventoryService.updateExchangeRatesAsync({
        UsdRate: Number(usdRate),
        EurRate: Number(eurRate),
        Notes: exchangeNotes,
      });
      toast.success('Kurlar güncellendi');
      const rates = await inventoryService.getExchangeRatesAsync();
      setActiveRates(rates);
    } catch (err) {
      console.error('Kurlar güncellenemedi:', err);
      toast.error('Kurlar güncellenirken hata oluştu.');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePreset = async () => {
    if (rentalRateTry === '') {
      toast.warning('TL kiralama oranı zorunludur.');
      return;
    }
    try {
      setBusy(true);
      await inventoryService.updatePricingPresetAsync({
        RentalRateTry: Number(rentalRateTry) / 100,
        RentalRateUsd: rentalRateUsd === '' ? null : Number(rentalRateUsd) / 100,
        RentalRateEur: rentalRateEur === '' ? null : Number(rentalRateEur) / 100,
        Notes: presetNotes,
      });
      toast.success('Kiralama oranları güncellendi');
      const preset = await inventoryService.getPricingPresetAsync();
      setActivePreset(preset);
    } catch (err) {
      console.error('Preset güncellenemedi:', err);
      toast.error('Kiralama oranları güncellenirken hata oluştu.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) {
      toast.warning('Birim adı boş olamaz.');
      return;
    }
    try {
      setBusyUnits(true);
      await unitService.createAsync({ UnitName: newUnitName.trim() });
      toast.success('Birim eklendi');
      setNewUnitName('');
      const data = await unitService.getAllAsync();
      setUnits(data);
    } catch (error) {
      console.error('Add unit error:', error);
      toast.error('Birim eklenirken hata oluştu.');
    } finally {
      setBusyUnits(false);
    }
  };

  const handleConfirmDeleteUnit = async () => {
    if (!unitToDelete) return;
    try {
      setBusyUnits(true);
      await unitService.deleteAsync(unitToDelete.UnitId);
      toast.success(`"${unitToDelete.UnitName}" birimi silindi`);
      setUnitToDelete(null);
      const data = await unitService.getAllAsync();
      setUnits(data);
    } catch (error) {
      console.error('Delete unit error:', error);
      toast.error('Birim silinirken hata oluştu.');
    } finally {
      setBusyUnits(false);
    }
  };

  const sortedUnits = useMemo(
    () => [...units].sort((a, b) => a.UnitName.localeCompare(b.UnitName, 'tr')),
    [units]
  );

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const updateNeedsAttention = updateStatus === 'available' || updateStatus === 'downloaded';
  const show = (tab: SettingsTab) => !searching && activeTab === tab;

  return (
    <div className="max-w-6xl mx-auto">
      {status && (
        <div
          className={`mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-error/30 bg-error/10 text-error'
          }`}
        >
          {status.type === 'success' ? <ShieldCheckIcon size={18} className="mt-0.5 shrink-0" /> : <WarningIcon size={18} className="mt-0.5 shrink-0" />}
          <span>{status.text}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">
        {/* Sol menü */}
        <aside className="w-full lg:w-60 shrink-0">
          <nav className="rounded-panel border border-background-border bg-background-panel p-1.5 lg:sticky lg:top-3">
            <div className="relative p-1.5 pb-2">
              <MagnifyingGlassIcon
                size={15}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults[0]) {
                    e.preventDefault();
                    openSetting(searchResults[0]);
                  } else if (e.key === 'Escape' && query) {
                    e.preventDefault();
                    setQuery('');
                  }
                }}
                placeholder="Ayar ara…"
                aria-label="Ayarlarda ara"
                className="input w-full py-2 pl-8 pr-8 text-sm [&::-webkit-search-cancel-button]:hidden"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Aramayı temizle"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-text-secondary hover:bg-background-hover hover:text-text-primary"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-0.5 lg:pb-0">
              {TAB_GROUPS.map((group) => (
                <div key={group.scope} className="contents lg:block">
                  <p className="hidden lg:block px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/80">
                    {group.label}
                  </p>
                  <div className="contents lg:flex lg:flex-col lg:gap-1">
                    {TABS.filter((tab) => tab.scope === group.scope).map((tab) => {
                      const active = !searching && activeTab === tab.id;
                      const showDot = tab.id === 'system' && updateNeedsAttention;
                      const matches = matchCountByTab.get(tab.id) ?? 0;
                      const dimmed = searching && matches === 0;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setQuery('');
                            setActiveTab(tab.id);
                          }}
                          className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors min-w-[9.5rem] lg:min-w-0 lg:w-full ${
                            active
                              ? 'bg-primary/10 text-primary'
                              : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                          } ${dimmed ? 'opacity-45' : ''}`}
                        >
                          {active ? (
                            <span className="absolute left-0 top-1/2 hidden lg:block h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                          ) : null}
                          <span className={`shrink-0 ${active ? 'text-primary' : 'text-text-secondary'}`}>{tab.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              {tab.label}
                              {showDot ? <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse" /> : null}
                            </span>
                            <span
                              className={`hidden lg:block text-[11px] mt-0.5 ${active ? 'text-primary/70' : 'text-text-secondary/80'}`}
                            >
                              {tab.description}
                            </span>
                          </span>
                          {searching && matches > 0 ? (
                            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                              {matches}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* İçerik */}
        <HighlightContext.Provider value={highlightId}>
        <div className="flex-1 min-w-0 space-y-4">
          {searching ? (
            <>
              <div className="mb-1">
                <h1 className="text-lg font-semibold tracking-tight text-text-primary">Arama sonuçları</h1>
                <p className="text-sm text-text-secondary">
                  “{query.trim()}” için {searchResults.length} ayar bulundu
                  {searchResults.length > 0 ? ' • Enter ile ilk sonuca gidin' : ''}
                </p>
              </div>
              {searchResults.length === 0 ? (
                <div className="rounded-panel border border-dashed border-background-border bg-background-panel px-4 py-12 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MagnifyingGlassIcon size={20} weight="duotone" />
                  </div>
                  <p className="text-sm font-medium text-text-primary">Eşleşen ayar yok</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Farklı bir kelime deneyin; örn. “kur”, “yedek”, “sütun”, “birim”, “şablon”.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {searchResults.map((entry) => {
                    const tab = TABS.find((t) => t.id === entry.tab)!;
                    const group = TAB_GROUPS.find((g) => g.scope === tab.scope)!;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => openSetting(entry)}
                          className="group flex w-full items-center justify-between gap-3 rounded-xl border border-background-border bg-background-panel px-4 py-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              {tab.icon}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-text-primary">{entry.title}</span>
                              <span className="block text-xs text-text-secondary mt-0.5 truncate">{entry.description}</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-[11px] text-text-secondary">
                            <span className="hidden sm:inline">
                              {group.label} › {tab.label}
                            </span>
                            <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="mb-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-text-primary">{activeTabMeta.label}</h1>
                <p className="text-sm text-text-secondary">{activeTabMeta.description}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-background-border bg-background-elevated/50 px-2.5 py-1 text-[11px] text-text-secondary">
                {SCOPE_NOTES[activeTabMeta.scope].icon}
                {SCOPE_NOTES[activeTabMeta.scope].text}
              </span>
            </div>
          )}

          {show('appearance') && (
            <>
              <SettingsSection
                id="theme"
                icon={theme === 'dark' ? <MoonIcon size={18} weight="duotone" /> : <SunIcon size={18} weight="duotone" />}
                title="Görünüm"
                description="Arayüz temasını tercihinize göre ayarlayın."
              >
                <div className="inline-flex rounded-xl border border-background-border bg-background-elevated/50 p-1">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      theme === 'light'
                        ? 'bg-background-panel text-text-primary shadow-sm border border-background-border'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <SunIcon size={16} />
                    Aydınlık
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      theme === 'dark'
                        ? 'bg-background-panel text-text-primary shadow-sm border border-background-border'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <MoonIcon size={16} />
                    Koyu
                  </button>
                </div>
              </SettingsSection>

              <SettingsSection
                id="archive-visibility"
                icon={<ArchiveIcon size={18} weight="duotone" />}
                title="Arşiv Kayıtları"
                description="Pasif depo ve arşivlenmiş ürünlerin listelerde görünürlüğünü yönetin."
              >
                <div className="space-y-3">
                  <ToggleRow
                    checked={showArchivedWarehouses}
                    onChange={setShowArchivedWarehouses}
                    title="Pasif depoları göster"
                    description="Depo listesi ve filtrelerinde kullanımdan kaldırılmış depolar görünür."
                  />
                  <ToggleRow
                    checked={showArchivedInventory}
                    onChange={setShowArchivedInventory}
                    title="Arşivlenmiş ürünleri göster"
                    description="Envanter listesinde arşivlenmiş malzeme kartları görünür."
                  />
                </div>
              </SettingsSection>
            </>
          )}

          {show('inventory') && (
            <>
              <SettingsSection
                id="units"
                icon={<RulerIcon size={18} weight="duotone" />}
                title="Birim Tanımları"
                description="Envanterde kullanılacak ölçü birimlerini yönetin."
                action={
                  !loadingUnits ? (
                    <span className="inline-flex items-center rounded-lg border border-background-border bg-background-elevated/60 px-2.5 py-1 text-xs font-medium text-text-secondary">
                      {units.length} birim
                    </span>
                  ) : null
                }
              >
                <div className="space-y-4">
                  <div className="rounded-xl border border-background-border bg-background-elevated/30 p-4">
                    <label htmlFor="new-unit-name" className="block text-xs font-medium text-text-secondary mb-2">
                      Yeni birim ekle
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="new-unit-name"
                        type="text"
                        value={newUnitName}
                        onChange={(e) => setNewUnitName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void handleAddUnit()}
                        placeholder="Örn: adet, ton, paket, koli"
                        className="input flex-1 py-2.5"
                        disabled={busyUnits}
                        maxLength={64}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddUnit()}
                        disabled={busyUnits || !newUnitName.trim()}
                        className="btn-primary py-2.5 px-4 flex items-center justify-center gap-1.5 shrink-0"
                      >
                        {busyUnits && !unitToDelete ? (
                          <CircleNotchIcon size={16} className="animate-spin" />
                        ) : (
                          <PlusIcon size={16} />
                        )}
                        Ekle
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-text-secondary/80">
                      Eklenen birimler ürün kartındaki ana birim seçiminde görünür.
                    </p>
                  </div>

                  {loadingUnits ? (
                    <div className="text-sm text-text-secondary flex items-center gap-2 py-8 justify-center">
                      <CircleNotchIcon size={16} className="animate-spin" />
                      Birimler yükleniyor...
                    </div>
                  ) : sortedUnits.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-background-border px-4 py-10 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <RulerIcon size={20} weight="duotone" />
                      </div>
                      <p className="text-sm font-medium text-text-primary">Henüz birim yok</p>
                      <p className="mt-1 text-xs text-text-secondary">Yukarıdaki alandan ilk biriminizi ekleyin.</p>
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sortedUnits.map((u) => (
                        <li
                          key={u.UnitId}
                          className="group flex items-center justify-between gap-3 rounded-xl border border-background-border bg-background-panel px-3.5 py-2.5 transition-colors hover:border-primary/25 hover:bg-background-elevated/40"
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-semibold uppercase">
                              {u.UnitName.slice(0, 2)}
                            </span>
                            <span className="text-sm font-medium text-text-primary truncate">{u.UnitName}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setUnitToDelete(u)}
                            disabled={busyUnits}
                            title="Birimi sil"
                            aria-label={`${u.UnitName} birimini sil`}
                            className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-secondary opacity-70 transition-all hover:bg-error/10 hover:text-error group-hover:opacity-100 disabled:opacity-40"
                          >
                            <TrashIcon size={15} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </SettingsSection>

              <SettingsSection
                id="product-categories"
                icon={<TagIcon size={18} weight="duotone" />}
                title="Ürün Kategorileri"
                description="Envanter ürün grupları ve kategori bazlı iskontolar Teklif Yönetimi ekranında düzenlenir."
              >
                <LinkCard
                  to="/offer-management?tab=categories"
                  icon={<TagIcon size={18} />}
                  title="Ürün kategorilerini yönet"
                  description="Ürün grupları ve kategori iskontoları"
                />
              </SettingsSection>
            </>
          )}

          {show('documents') && (
            <>
              <DocumentCategoriesSettings />

              <SettingsSection
                id="document-templates"
                icon={<FileTextIcon size={18} weight="duotone" />}
                title="Belge Şablonları"
                description="Teklif, sözleşme ve kullanım ekstresi çıktılarının tasarımı."
              >
                <LinkCard
                  to="/document-templates"
                  icon={<FileTextIcon size={18} />}
                  title="Şablonları düzenle"
                  description="Teklif, sözleşme ve kullanım ekstresi şablonları"
                />
              </SettingsSection>

              <SettingsSection
                id="offer-packages"
                icon={<PackageIcon size={18} weight="duotone" />}
                title="Teklif Paketleri"
                description="Sık kullanılan ürün listelerini paket olarak kaydedip tekliflere hızlıca uygulayın."
              >
                <LinkCard
                  to="/offer-management?tab=packages"
                  icon={<PackageIcon size={18} />}
                  title="Teklif paketlerini yönet"
                  description="Hazır ürün listeleri ve hızlı uygulama"
                  tone="info"
                />
              </SettingsSection>
            </>
          )}

          {show('columns') && (
            <>
              <div className="flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/5 px-4 py-3 text-xs leading-relaxed text-text-secondary">
                <InfoIcon size={16} weight="duotone" className="mt-0.5 shrink-0 text-info" />
                <span>
                  Burada hangi sütunların görüneceğini seçersiniz. Sıra ve genişliği doğrudan tablonun üzerinde
                  değiştirebilirsiniz: başlığı sürükleyerek taşıyın, iki sütun arasındaki çizgiyi çekerek genişletin,
                  çift tıklayarak içeriğe sığdırın. Başlığa sağ tıklayıp düzeni sıfırlayabilirsiniz.
                </span>
              </div>

              <SettingsSection
                id="inventory-columns"
                icon={<ColumnsIcon size={18} weight="duotone" />}
                title="Envanter tablosu"
                description="Sütunları açıp kapatın; alttaki önizleme anında güncellenir."
              >
                <ColumnToggleChips
                  columns={INVENTORY_TABLE_COLUMNS}
                  visibility={inventoryColumns}
                  onToggle={setInventoryColumnVisible}
                />
                <ColumnPreviewTable
                  columns={INVENTORY_TABLE_COLUMNS}
                  visibility={inventoryColumns}
                  tableId="InventoryPage"
                  rows={INVENTORY_PREVIEW_ROWS}
                  emptyHint="Önizleme için en az bir sütun seçin."
                />
              </SettingsSection>

              <SettingsSection
                id="customer-columns"
                icon={<ColumnsIcon size={18} weight="duotone" />}
                title="Müşteri tablosu"
                description="Sütunları açıp kapatın; alttaki önizleme anında güncellenir."
              >
                <ColumnToggleChips
                  columns={CUSTOMER_TABLE_COLUMNS}
                  visibility={customerColumns}
                  onToggle={setCustomerColumnVisible}
                />
                <ColumnPreviewTable
                  columns={CUSTOMER_TABLE_COLUMNS}
                  visibility={customerColumns}
                  tableId="CustomersPage"
                  rows={CUSTOMER_PREVIEW_ROWS}
                  emptyHint="Önizleme için en az bir sütun seçin."
                />
              </SettingsSection>
            </>
          )}

          {show('finance') && (
            <>
              <SettingsSection
                id="exchange-rates"
                icon={<CurrencyCircleDollar size={18} weight="duotone" />}
                title="Döviz Kuru Yönetimi"
                description="Uygulama genelinde kullanılacak USD ve EUR kurlarını güncelleyin."
                action={
                  <button
                    type="button"
                    onClick={handleSaveRates}
                    disabled={busy}
                    className="btn-primary py-2.5 px-4 flex items-center gap-2 text-sm"
                  >
                    {busy ? <CircleNotchIcon size={16} className="animate-spin" /> : null}
                    {busy ? 'Kaydediliyor...' : 'Kurları Kaydet'}
                  </button>
                }
              >
                <div className="mb-4 rounded-xl border border-background-border/70 bg-background-elevated/30 p-3.5">
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div>
                      <div className="text-sm font-medium text-text-primary">Güncel kur</div>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Salt görüntüleme. Uygulamadaki kayıtlı kurları değiştirmez.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadLiveRates()}
                      disabled={liveRatesLoading}
                      className="btn-secondary py-1.5 px-2.5 text-xs flex items-center gap-1.5 shrink-0"
                    >
                      {liveRatesLoading ? (
                        <CircleNotchIcon size={14} className="animate-spin" />
                      ) : (
                        <ArrowClockwiseIcon size={14} />
                      )}
                      Yenile
                    </button>
                  </div>
                  {liveRatesError ? (
                    <p className="text-xs text-red-300">{liveRatesError}</p>
                  ) : liveRates ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <MetaChip label="USD satış" value={`$1 = ₺${liveRates.usdSelling.toFixed(4)}`} />
                      <MetaChip label="EUR satış" value={`€1 = ₺${liveRates.eurSelling.toFixed(4)}`} />
                      <MetaChip
                        label={liveRates.source}
                        value={liveRates.date || '—'}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-text-secondary">
                      {liveRatesLoading ? 'Güncel kur yükleniyor...' : 'Güncel kur henüz alınmadı.'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">USD Kuru ($)</label>
                    <input
                      type="number"
                      value={usdRate}
                      onChange={(e) => setUsdRate(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input w-full py-2.5"
                      step="0.01"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">EUR Kuru (€)</label>
                    <input
                      type="number"
                      value={eurRate}
                      onChange={(e) => setEurRate(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input w-full py-2.5"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Notlar</label>
                  <input
                    type="text"
                    value={exchangeNotes}
                    onChange={(e) => setExchangeNotes(e.target.value)}
                    className="input w-full py-2.5"
                    placeholder="Örn: Mayıs 2026 kuru"
                  />
                </div>

                {activeRates && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <MetaChip label="Kayıtlı USD" value={`$1 = ₺${activeRates.UsdRate.toFixed(2)}`} />
                    <MetaChip label="Kayıtlı EUR" value={`€1 = ₺${activeRates.EurRate.toFixed(2)}`} />
                    <MetaChip label="Son kayıt" value={formatTrDateTime(activeRates.UpdatedAt)} />
                  </div>
                )}
              </SettingsSection>

              <SettingsSection
                id="rental-rates"
                icon={<CurrencyCircleDollar size={18} weight="duotone" />}
                title="Kiralama Oranı Ön Ayarı"
                description="Her para birimi için varsayılan kiralama çarpanlarını belirleyin."
                action={
                  <button
                    type="button"
                    onClick={handleSavePreset}
                    disabled={busy}
                    className="btn-primary py-2.5 px-4 flex items-center gap-2 text-sm"
                  >
                    {busy ? <CircleNotchIcon size={16} className="animate-spin" /> : null}
                    {busy ? 'Kaydediliyor...' : 'Oranları Kaydet'}
                  </button>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">TL Oranı</label>
                    <input
                      type="number"
                      value={rentalRateTry}
                      onChange={(e) => setRentalRateTry(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input w-full py-2.5"
                      step="0.001"
                      min="0"
                    />
                    <span className="mt-1 block text-xs text-text-secondary">%{Number(rentalRateTry) || 0}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      USD Oranı <span className="font-normal opacity-70">(opsiyonel)</span>
                    </label>
                    <input
                      type="number"
                      value={rentalRateUsd}
                      onChange={(e) => setRentalRateUsd(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input w-full py-2.5"
                      step="0.001"
                      min="0"
                    />
                    <span className="mt-1 block text-xs text-text-secondary">%{Number(rentalRateUsd) || 0}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">
                      EUR Oranı <span className="font-normal opacity-70">(opsiyonel)</span>
                    </label>
                    <input
                      type="number"
                      value={rentalRateEur}
                      onChange={(e) => setRentalRateEur(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input w-full py-2.5"
                      step="0.001"
                      min="0"
                    />
                    <span className="mt-1 block text-xs text-text-secondary">%{Number(rentalRateEur) || 0}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Notlar</label>
                  <input
                    type="text"
                    value={presetNotes}
                    onChange={(e) => setPresetNotes(e.target.value)}
                    className="input w-full py-2.5"
                    placeholder="Örn: Standart kiralama oranı"
                  />
                </div>

                {!activePreset && (
                  <div className="rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                    Henüz oran tanımlanmamış.
                  </div>
                )}

                {activePreset && (
                  <MetaChip
                    label="Son güncelleme"
                    value={formatTrDateTime(activePreset.UpdatedAt || activePreset.CreatedAt)}
                  />
                )}
              </SettingsSection>
            </>
          )}

          {show('system') && (
            <>
              <SettingsSection
                id="software-update"
                icon={<ArrowClockwiseIcon size={18} weight="duotone" />}
                title="Yazılım Güncelleme"
                description={`Mevcut sürüm: v${window.electron?.appVersion || packageJson.version}`}
                className={
                  updateNeedsAttention
                    ? 'border-error/40 ring-1 ring-error/15'
                    : ''
                }
                action={
                  <>
                    {updateStatus === 'uptodate' || updateStatus === 'error' || updateStatus === 'checking' ? (
                      <button
                        type="button"
                        onClick={handleCheckUpdates}
                        disabled={isChecking}
                        className="btn-secondary py-2.5 px-4 flex items-center gap-2 text-sm"
                      >
                        {isChecking ? (
                          <CircleNotchIcon size={16} className="animate-spin" />
                        ) : (
                          <ArrowClockwiseIcon size={16} />
                        )}
                        {isChecking ? 'Denetleniyor...' : 'Güncellemeleri Denetle'}
                      </button>
                    ) : null}

                    {updateStatus === 'available' ? (
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="btn-primary py-2.5 px-4 flex items-center gap-2 text-sm"
                      >
                        <DownloadSimpleIcon size={16} />
                        Şimdi İndir
                      </button>
                    ) : null}

                    {updateStatus === 'downloaded' ? (
                      <button
                        type="button"
                        onClick={handleInstall}
                        disabled={isInstalling}
                        className="btn-success py-2.5 px-4 flex items-center gap-2 text-sm"
                      >
                        {isInstalling ? (
                          <CircleNotchIcon size={16} className="animate-spin" />
                        ) : (
                          <ArrowClockwiseIcon size={16} />
                        )}
                        {isInstalling ? 'Hazırlanıyor...' : 'Yükle ve Yeniden Başlat'}
                      </button>
                    ) : null}
                  </>
                }
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-text-secondary">Durum</span>
                    <span
                      className={`badge flex items-center gap-1.5 ${
                        updateStatus === 'uptodate'
                          ? 'bg-success/10 text-success'
                          : updateStatus === 'available'
                            ? 'bg-error/10 text-error animate-pulse'
                            : updateStatus === 'checking'
                              ? 'bg-info/10 text-info'
                              : updateStatus === 'downloaded'
                                ? 'bg-primary/10 text-primary'
                                : updateStatus === 'downloading'
                                  ? 'bg-info/10 text-info'
                                  : updateStatus === 'error'
                                    ? 'bg-error/10 text-error'
                                    : 'bg-background-elevated text-text-secondary'
                      }`}
                    >
                      {(updateStatus === 'available' || updateStatus === 'error') && <WarningIcon size={14} />}
                      {updateStatus === 'checking' && (
                        <>
                          <CircleNotchIcon size={14} className="animate-spin" />
                          Kontrol ediliyor...
                        </>
                      )}
                      {updateStatus === 'uptodate' && (
                        <>
                          <ShieldCheckIcon size={14} />
                          Yazılımınız Güncel
                        </>
                      )}
                      {updateStatus === 'available' && 'Yeni Güncelleme Mevcut'}
                      {updateStatus === 'downloading' && 'İndiriliyor...'}
                      {updateStatus === 'downloaded' && 'Yüklemeye Hazır'}
                      {updateStatus === 'error' && 'Hata Oluştu'}
                    </span>
                  </div>

                  {updateInfo && (
                    <div className="text-sm">
                      <span className="text-text-secondary">Yeni sürüm: </span>
                      <span className="font-mono font-semibold text-text-primary">{updateInfo.version}</span>
                    </div>
                  )}

                  {updateError && (
                    <div className="flex items-center gap-1.5 text-xs text-error">
                      <WarningIcon size={14} />
                      <span>{updateError}</span>
                    </div>
                  )}

                  {updateStatus === 'downloading' && (
                    <div className="max-w-md">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-text-secondary">İndirme ilerlemesi</span>
                        <span className="text-xs font-semibold text-primary tabular-nums">%{updateProgress.toFixed(0)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full border border-background-border-muted bg-background-elevated">
                        <div
                          className="h-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${updateProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {isInstalling && (
                    <p className="text-xs font-medium text-success animate-pulse">
                      Uygulama saniyeler içinde güncellenip yeniden başlatılacak...
                    </p>
                  )}
                </div>
              </SettingsSection>

              <SettingsSection
                id="backup"
                icon={<DownloadSimpleIcon size={18} weight="duotone" />}
                title="Manuel Yedekleme"
                description="Veritabanının tam yedeğini `.sql.gz` olarak indirin."
                action={
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={busy}
                    className="btn-primary py-2.5 px-4 flex items-center gap-2 text-sm"
                  >
                    {busy ? (
                      <ArrowClockwiseIcon size={16} className="animate-spin" />
                    ) : (
                      <DownloadSimpleIcon size={16} />
                    )}
                    {busy ? 'Yedek alınıyor...' : 'Manuel Yedek Al'}
                  </button>
                }
              >
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                  <WarningIcon size={15} className="mt-0.5 shrink-0" />
                  <span>Saatte en fazla 1 kez manuel yedek alabilirsiniz.</span>
                </div>
                {backupStatusError ? (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-error/25 bg-error/10 px-3.5 py-2.5 text-xs text-error">
                    <WarningIcon size={15} className="mt-0.5 shrink-0" />
                    <span>{backupStatusError}</span>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <MetaChip label="Son manuel yedek" value={formatTrDateTime(lastBackupAt)} />
                  <MetaChip label="Son otomatik yedek" value={formatTrDateTime(lastAutoBackupAt)} />
                </div>
              </SettingsSection>
            </>
          )}
        </div>
        </HighlightContext.Provider>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Manuel yedek alınacak"
        message={confirmMessage}
        confirmLabel="Evet, yedeği indir"
        cancelLabel="Vazgeç"
        onCancel={() => (busy ? null : setConfirmOpen(false))}
        onConfirm={handleConfirm}
        loading={busy}
        variant="default"
      />

      <ConfirmModal
        open={unitToDelete != null}
        title="Birim silinsin mi?"
        message={
          unitToDelete
            ? `"${unitToDelete.UnitName}" birimi kalıcı olarak silinecek.\nBu birimi kullanan ürünlerde seçim etkilenebilir.\n\nDevam etmek istiyor musunuz?`
            : ''
        }
        confirmLabel="Evet, sil"
        cancelLabel="Vazgeç"
        onCancel={() => (busyUnits ? null : setUnitToDelete(null))}
        onConfirm={() => void handleConfirmDeleteUnit()}
        loading={busyUnits}
        variant="danger"
      />
    </div>
  );
}
