import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowClockwise,
  CaretRight,
  ChartBar,
  ClipboardText,
  CurrencyCircleDollar,
  FileText,
  Info,
  Money,
  Package,
  Plus,
  Receipt,
  Truck,
  Users,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardService, type DashboardSummary } from '../services/dashboardService';
import { useTabReturn } from '../components/tabs/TabContext';
import { useAuthStore } from '../store/authStore';
import {
  contractPath,
  customerPath,
  inventoryPath,
  newQuotePath,
  type ContractTabState,
} from '../utils/entityNavigation';
import {
  expirationBucket,
  formatCompactMoney,
  formatCurrencyBreakdown,
  formatDate,
  formatDaysRemaining,
  formatMoney,
  formatMonthKey,
  hasForeignCurrency,
  percent,
  shareOfPrevious,
  type ExpirationBucket,
} from '../utils/dashboardFormat';

type ChartMetric = 'invoiced' | 'revenue' | 'contracts';
type ChartRange = 6 | 12;

const CHART_METRICS: { key: ChartMetric; label: string; hint: string }[] = [
  { key: 'invoiced', label: 'Faturalanan', hint: 'Kesilen faturalar, fatura tarihine göre (₺ karşılığı)' },
  { key: 'revenue', label: 'Kapanan gelir', hint: 'Tamamlanan kira sözleşmeleri (kapanış ayı) + satışlar (satış ayı)' },
  { key: 'contracts', label: 'Yeni sözleşme', hint: 'Başlangıç tarihine göre yeni kira ve satış sözleşmesi adedi' },
];

const tint = (color: string, pct = 12) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const C = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  purple: 'var(--color-purple)',
  neutral: 'var(--color-border-strong)',
  grid: 'var(--color-border-muted)',
  axis: 'var(--color-border)',
  text: 'var(--color-text-primary)',
  textMuted: 'var(--color-text-secondary)',
  panel: 'var(--color-bg-panel)',
};

/* ------------------------------------------------------------------ */
/* Küçük yapı taşları                                                  */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  icon,
  action,
  children,
  className = '',
  id,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card flex flex-col min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h2 className="text-base font-semibold truncate">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-text-secondary hover:text-primary flex items-center gap-0.5 shrink-0"
    >
      {label}
      <CaretRight size={12} />
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="text-text-secondary text-sm py-6 text-center">{children}</div>;
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  onClick,
  title,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  color: string;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: tint(color), color }}>
          {icon}
        </div>
        <span className="text-text-secondary text-sm truncate">{label}</span>
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums truncate">{value}</div>
      {sub ? <div className="mt-1 text-xs text-text-secondary">{sub}</div> : null}
    </>
  );
  const cls = 'card text-left w-full min-w-0 border-l-4';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`${cls} hover:bg-background-hover transition-colors cursor-pointer`}
        style={{ borderLeftColor: color }}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cls} style={{ borderLeftColor: color }} title={title}>
      {body}
    </div>
  );
}

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: tint(color, 14), color }}
    >
      {children}
    </span>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-background-border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            value === o.key ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ListButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left py-2.5 px-2 -mx-2 rounded-md border-b border-background-border last:border-0 hover:bg-background-hover transition-colors flex items-center justify-between gap-3"
    >
      {children}
    </button>
  );
}

/** Tutar: ₺ karşılığı hesaplanamıyorsa para birimi kırılımını gösterir. */
function MoneyValue({
  tryValue,
  byCurrency,
}: {
  tryValue: number | null;
  byCurrency?: { TRY: number; EUR: number; USD: number };
}) {
  if (tryValue == null) {
    return (
      <span title="Döviz tutarlarını ₺'ye çevirmek için aktif kur tanımlı değil">
        {byCurrency ? formatCurrencyBreakdown(byCurrency) : '—'}
      </span>
    );
  }
  return <span>{formatMoney(tryValue)}</span>;
}

/* ------------------------------------------------------------------ */
/* Sayfa                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];
  const can = (p: string) => perms.includes(p);

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const [metric, setMetric] = useState<ChartMetric>('invoiced');
  const [range, setRange] = useState<ChartRange>(12);
  const [expTab, setExpTab] = useState<ExpirationBucket | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const load = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError(null);
      setData(await dashboardService.getSummaryAsync());
    } catch (e) {
      console.error('Dashboard load error:', e);
      setError('Dashboard verileri alınamadı. Bağlantıyı kontrol edip yenileyin.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Başka sekmede yapılan değişiklikler, bu sekmeye dönüldüğünde yansısın.
  useTabReturn(() => void load());

  const openContract = (id: number, state?: ContractTabState) =>
    navigate(contractPath(id), { state: state && Object.keys(state).length > 0 ? state : null });

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* ---------- türetilmiş veriler ---------- */

  const chartData = useMemo(() => {
    const series = (data?.monthlyRevenueSeries ?? []).slice(-range);
    return series.map((p) => ({
      ay: formatMonthKey(p.month, true),
      ayUzun: formatMonthKey(p.month),
      faturalanan: p.invoiced ?? 0,
      gelir: p.revenue ?? 0,
      satis: p.saleRevenue ?? 0,
      kapanan: p.contractCount ?? 0,
      yeniKira: p.newRentalContracts ?? 0,
      yeniSatis: p.newSaleContracts ?? 0,
      eksikKur: (metric === 'invoiced' ? p.invoiced : p.revenue) == null,
    }));
  }, [data, range, metric]);

  const chartStats = useMemo(() => {
    if (chartData.length === 0) return null;
    const values = chartData.map((d) =>
      metric === 'invoiced' ? d.faturalanan : metric === 'revenue' ? d.gelir : d.yeniKira + d.yeniSatis
    );
    // Ortalamaya içinde bulunulan (yarım) ay katılmaz
    const complete = values.slice(0, -1);
    const total = values.reduce((s, v) => s + v, 0);
    const avg = complete.length > 0 ? complete.reduce((s, v) => s + v, 0) / complete.length : 0;
    let bestIdx = 0;
    values.forEach((v, i) => {
      if (v > values[bestIdx]) bestIdx = i;
    });
    return { total, avg, best: chartData[bestIdx], bestValue: values[bestIdx] };
  }, [chartData, metric]);

  const expirations = data?.upcomingExpirations ?? [];
  const expByBucket = useMemo(() => {
    const out: Record<ExpirationBucket, typeof expirations> = { overdue: [], week: [], month: [] };
    for (const e of expirations) out[expirationBucket(e.DaysRemaining ?? 0)].push(e);
    return out;
  }, [expirations]);
  const activeExpTab: ExpirationBucket =
    expTab ?? (expByBucket.overdue.length > 0 ? 'overdue' : expByBucket.week.length > 0 ? 'week' : 'month');

  /* ---------- durumlar ---------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <ArrowClockwise size={32} className="text-text-secondary animate-spin" />
          <span className="text-text-secondary text-sm">Yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card flex flex-col items-center gap-3 py-12 text-center">
        <WarningCircle size={32} className="text-error" />
        <div className="text-sm text-text-secondary">{error ?? 'Veri yok.'}</div>
        <button type="button" onClick={() => void load(true)} className="btn-primary py-2 px-3 text-sm">
          Tekrar dene
        </button>
      </div>
    );
  }

  const d = data;
  const available = Math.max(0, d.totalStockSum - d.itemsOnRentCount - d.reservedStockSum);
  const utilization = percent(d.itemsOnRentCount, d.totalStockSum);
  const criticalStock = d.lowStockItems.filter((i) => (i.AvailableStock ?? 0) <= 0).length;
  const checksOverdue = (d.checksDueSoon ?? []).filter((c) => c.DaysRemaining < 0).length;
  const invoicedShare = shareOfPrevious(d.invoicedThisMonth, d.invoicedLastMonth);
  const revenueShare = shareOfPrevious(d.monthlyRevenue, d.lastMonthRevenue);
  const missingRate = !d.exchangeRate && hasForeignCurrency(d.totalRevenueByCurrency);

  const attention: { key: string; label: string; count: number; color: string; onClick: () => void }[] = [
    {
      key: 'overdue',
      label: 'süresi geçmiş sözleşme',
      count: d.overdueContractsCount,
      color: C.error,
      onClick: () => {
        setExpTab('overdue');
        scrollTo('dash-expirations');
      },
    },
    {
      key: 'week',
      label: 'sözleşme 7 gün içinde bitiyor',
      count: d.expiringIn7DaysCount,
      color: C.warning,
      onClick: () => {
        setExpTab('week');
        scrollTo('dash-expirations');
      },
    },
    {
      key: 'uninvoiced',
      label: 'sözleşme 30+ gündür faturasız',
      count: d.uninvoicedContractsCount,
      color: C.warning,
      onClick: () => scrollTo('dash-uninvoiced'),
    },
    {
      key: 'ship',
      label: 'sözleşme sevk bekliyor',
      count: d.pendingShipmentsCount,
      color: C.info,
      onClick: () => scrollTo('dash-shipments'),
    },
    {
      key: 'stock',
      label: 'üründe stok tükendi',
      count: criticalStock,
      color: C.error,
      onClick: () => scrollTo('dash-stock'),
    },
    {
      key: 'checks',
      label: checksOverdue > 0 ? `çek vadesi geçti / yaklaşıyor` : 'çekin vadesi 30 gün içinde',
      count: d.checksDueSoonCount,
      color: checksOverdue > 0 ? C.error : C.info,
      onClick: () => scrollTo('dash-checks'),
    },
  ].filter((a) => a.count > 0);

  const generatedAt = d.generatedAt ? new Date(d.generatedAt) : null;

  return (
    <div className="space-y-5">
      {/* Üst çubuk: hızlı işlemler + güncelleme */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(newQuotePath('rental'))}
            className="btn-primary flex items-center gap-1.5 py-2 px-3 text-sm"
          >
            <Plus size={14} weight="bold" />
            Kiralama teklifi
          </button>
          <button
            type="button"
            onClick={() => navigate(newQuotePath('sale'))}
            className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
          >
            <Plus size={14} weight="bold" />
            Satış teklifi
          </button>
          {can('shipments_view') && (
            <button
              type="button"
              onClick={() => navigate('/shipments')}
              className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
            >
              <Truck size={14} />
              Sevkiyatlar
            </button>
          )}
          {can('customers_view') && (
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
            >
              <Users size={14} />
              Müşteriler
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          {d.exchangeRate ? (
            <span title="₺ karşılıkları bu aktif kurla hesaplanır">
              Kur: $ {d.exchangeRate.UsdRate.toLocaleString('tr-TR')} · € {d.exchangeRate.EurRate.toLocaleString('tr-TR')}
            </span>
          ) : null}
          {generatedAt ? <span>Güncelleme {generatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span> : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-1.5 py-1.5 px-2.5 text-sm"
          >
            <ArrowClockwise size={14} weight="bold" className={refreshing ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {error ? (
        <div className="card text-sm flex items-center gap-2" style={{ color: C.error }}>
          <WarningCircle size={16} /> {error} Son başarılı veriler gösteriliyor.
        </div>
      ) : null}

      {missingRate ? (
        <div className="card text-sm flex items-center gap-2 text-text-secondary">
          <Info size={16} style={{ color: C.warning }} />
          Dövizli sözleşmeler var ancak aktif kur tanımlı değil; ₺ toplamları yerine para birimi kırılımı gösteriliyor.
        </div>
      ) : null}

      {/* Dikkat şeridi */}
      <div className="card py-3">
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: C.success }} />
            Acil bir durum yok — geciken sözleşme, faturasız dönem, bekleyen sevk veya tükenen stok bulunmuyor.
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium mr-1 flex items-center gap-1.5">
              <Warning size={16} style={{ color: C.warning }} />
              Dikkat
            </span>
            {attention.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={a.onClick}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-background-hover transition-colors"
                style={{ borderColor: tint(a.color, 45) }}
              >
                <span className="font-semibold tabular-nums" style={{ color: a.color }}>
                  {a.count}
                </span>
                <span className="text-text-secondary">{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <StatCard
          label="Aktif kira sözleşmesi"
          value={d.activeContractsCount}
          sub={`${d.activeCustomersCount} müşteride · ${d.completedContractsThisMonth} sözleşme bu ay kapandı`}
          icon={<ClipboardText size={18} />}
          color={C.primary}
          onClick={() => navigate('/contracts/rental')}
          title="Kiralama sözleşmelerine git"
        />
        <StatCard
          label="Sahadaki malzeme"
          value={d.itemsOnRentCount.toLocaleString('tr-TR')}
          sub={`Stoğun %${utilization.toLocaleString('tr-TR')}'i kirada${
            d.reservedStockSum > 0 ? ` · ${d.reservedStockSum.toLocaleString('tr-TR')} rezerve` : ''
          }`}
          icon={<Package size={18} />}
          color={C.warning}
          onClick={can('inventory_view') ? () => navigate('/inventory?stockStatus=onRent') : undefined}
          title="Envanterde kiradaki malzemeleri gör"
        />
        <StatCard
          label="Bu ay faturalanan"
          value={<MoneyValue tryValue={d.invoicedThisMonth} />}
          sub={
            invoicedShare != null
              ? `Geçen ayın %${invoicedShare}'i (${formatMoney(d.invoicedLastMonth ?? 0)})`
              : `Geçen ay: ${d.invoicedLastMonth != null ? formatMoney(d.invoicedLastMonth) : '—'}`
          }
          icon={<Receipt size={18} />}
          color={C.success}
          title="Sözleşmelere kesilen faturaların ₺ karşılığı (fatura tarihine göre)"
        />
        <StatCard
          label="Bu ay kapanan gelir"
          value={<MoneyValue tryValue={d.monthlyRevenue} byCurrency={d.monthlyRevenueByCurrency} />}
          sub={
            revenueShare != null
              ? `Geçen ayın %${revenueShare}'i (${formatMoney(d.lastMonthRevenue ?? 0)})`
              : `Geçen ay: ${d.lastMonthRevenue != null ? formatMoney(d.lastMonthRevenue) : '—'}`
          }
          icon={<CurrencyCircleDollar size={18} />}
          color={C.purple}
          title="Bu ay tamamlanan kira sözleşmeleri + bu ayki satışlar"
        />
        <StatCard
          label="Bu ay yeni sözleşme"
          value={d.newContractsThisMonth}
          sub={`Geçen ay: ${d.newContractsLastMonth}`}
          icon={<FileText size={18} />}
          color={C.info}
        />
        <StatCard
          label="Bekleyen teklif"
          value={d.pendingQuotesCount}
          sub={
            d.pendingQuotesCount > 0 ? (
              <>
                Toplam <MoneyValue tryValue={d.pendingQuotesTotal} byCurrency={d.pendingQuotesByCurrency} />
              </>
            ) : (
              'Onay bekleyen teklif yok'
            )
          }
          icon={<ClipboardText size={18} />}
          color={C.neutral}
          onClick={() => navigate('/contracts/rental')}
          title="Teklif listesine git"
        />
      </div>

      {/* Trend grafiği + stok */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          title="Aylık trend"
          icon={<ChartBar size={18} className="text-primary" />}
          className="xl:col-span-2"
          action={
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <Segmented
                options={CHART_METRICS.map((m) => ({ key: m.key, label: m.label, title: m.hint }))}
                value={metric}
                onChange={setMetric}
              />
              <Segmented
                options={[
                  { key: 6 as ChartRange, label: '6 ay' },
                  { key: 12 as ChartRange, label: '12 ay' },
                ]}
                value={range}
                onChange={setRange}
              />
            </div>
          }
        >
          {chartStats ? (
            <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4 text-sm">
              <div>
                <div className="text-xs text-text-secondary">Toplam ({range} ay)</div>
                <div className="font-semibold tabular-nums">
                  {metric === 'contracts' ? chartStats.total : formatMoney(chartStats.total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-text-secondary">Aylık ortalama (bu ay hariç)</div>
                <div className="font-semibold tabular-nums">
                  {metric === 'contracts'
                    ? chartStats.avg.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
                    : formatMoney(chartStats.avg)}
                </div>
              </div>
              {chartStats.bestValue > 0 ? (
                <div>
                  <div className="text-xs text-text-secondary">En yüksek ay</div>
                  <div className="font-semibold tabular-nums">
                    {chartStats.best.ayUzun} ·{' '}
                    {metric === 'contracts' ? chartStats.bestValue : formatMoney(chartStats.bestValue)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="h-[260px] w-full min-w-0">
            {isMounted && (
              <ResponsiveContainer width="100%" height={260} minWidth={0} minHeight={0}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="ay"
                    tick={{ fill: C.textMuted, fontSize: 12 }}
                    axisLine={{ stroke: C.axis }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: C.textMuted, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={metric === 'contracts' ? false : undefined}
                    tickFormatter={(v: number) => (metric === 'contracts' ? String(v) : formatCompactMoney(v))}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: tint(C.primary, 8) }}
                    contentStyle={{
                      backgroundColor: C.panel,
                      border: `1px solid ${C.axis}`,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: C.text, fontWeight: 600, marginBottom: 4 }}
                    itemStyle={{ color: C.text }}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as (typeof chartData)[number] | undefined;
                      if (!row) return '';
                      return row.eksikKur ? `${row.ayUzun} (dövizli tutar kur yokluğundan hariç)` : row.ayUzun;
                    }}
                    formatter={(value, name) => {
                      const v = Number(value ?? 0);
                      return [metric === 'contracts' ? `${v} adet` : formatMoney(v), String(name)];
                    }}
                  />
                  {chartStats && chartStats.avg > 0 ? (
                    <ReferenceLine
                      y={chartStats.avg}
                      stroke={C.neutral}
                      strokeDasharray="4 4"
                      label={{ value: 'ort.', position: 'insideTopRight', fill: C.textMuted, fontSize: 11 }}
                    />
                  ) : null}
                  {metric === 'invoiced' && (
                    <Bar dataKey="faturalanan" name="Faturalanan" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  )}
                  {metric === 'revenue' && (
                    <Bar dataKey="gelir" name="Kapanan gelir" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  )}
                  {metric === 'contracts' && (
                    <>
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12, color: C.textMuted, paddingBottom: 8 }}
                      />
                      <Bar dataKey="yeniKira" name="Kira" stackId="n" fill={C.primary} maxBarSize={36} stroke={C.panel} strokeWidth={1} />
                      <Bar
                        dataKey="yeniSatis"
                        name="Satış"
                        stackId="n"
                        fill={C.purple}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                        stroke={C.panel}
                        strokeWidth={1}
                      />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 text-xs text-text-secondary">{CHART_METRICS.find((m) => m.key === metric)?.hint}</div>
        </Panel>

        <Panel title="Stok durumu" icon={<Package size={18} className="text-primary" />}>
          {d.totalStockSum <= 0 ? (
            <Empty>Stok kaydı yok</Empty>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-3xl font-semibold tabular-nums">%{utilization.toLocaleString('tr-TR')}</span>
                  <span className="text-xs text-text-secondary">kullanım oranı</span>
                </div>
                <div className="w-full flex overflow-hidden rounded-full gap-[2px]" style={{ height: 12 }}>
                  {[
                    { v: d.itemsOnRentCount, c: C.primary, l: 'Kirada' },
                    { v: d.reservedStockSum, c: C.purple, l: 'Rezerve' },
                    { v: available, c: C.neutral, l: 'Müsait' },
                  ]
                    .filter((s) => s.v > 0)
                    .map((s) => (
                      <div
                        key={s.l}
                        title={`${s.l}: ${s.v.toLocaleString('tr-TR')}`}
                        style={{ width: `${(s.v / d.totalStockSum) * 100}%`, backgroundColor: s.c }}
                      />
                    ))}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { l: 'Kirada (sahada)', v: d.itemsOnRentCount, c: C.primary },
                  { l: 'Rezerve (sevk bekliyor)', v: d.reservedStockSum, c: C.purple },
                  { l: 'Müsait', v: available, c: C.neutral },
                ].map((r) => (
                  <div key={r.l} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-text-secondary">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.c }} />
                      {r.l}
                    </span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{r.v.toLocaleString('tr-TR')}</span>
                      <span className="text-text-secondary text-xs ml-1.5">%{percent(r.v, d.totalStockSum).toLocaleString('tr-TR')}</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-background-border">
                  <span className="text-text-secondary">Toplam stok</span>
                  <span className="font-semibold tabular-nums">
                    {d.totalStockSum.toLocaleString('tr-TR')}{' '}
                    <span className="text-xs text-text-secondary font-normal">({d.totalInventoryCount} ürün kartı)</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Biten / geciken sözleşmeler + faturasız */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel
          id="dash-expirations"
          title="Bitişi yaklaşan sözleşmeler"
          icon={<Warning size={18} style={{ color: C.warning }} />}
          action={
            <Segmented
              options={[
                { key: 'overdue' as ExpirationBucket, label: `Gecikmiş (${expByBucket.overdue.length})` },
                { key: 'week' as ExpirationBucket, label: `7 gün (${expByBucket.week.length})` },
                { key: 'month' as ExpirationBucket, label: `30 gün (${expByBucket.month.length})` },
              ]}
              value={activeExpTab}
              onChange={setExpTab}
            />
          }
        >
          {expByBucket[activeExpTab].length === 0 ? (
            <Empty>
              {activeExpTab === 'overdue'
                ? 'Süresi geçmiş aktif sözleşme yok'
                : activeExpTab === 'week'
                  ? '7 gün içinde biten sözleşme yok'
                  : '8–30 gün içinde biten sözleşme yok'}
            </Empty>
          ) : (
            <div className="max-h-[340px] overflow-y-auto pr-1">
              {expByBucket[activeExpTab].map((e) => {
                const days = e.DaysRemaining ?? 0;
                const color = days < 0 ? C.error : days <= 2 ? C.warning : C.primary;
                return (
                  <ListButton key={e.ContractId} onClick={() => openContract(e.ContractId)}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{e.CustomerName || '—'}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {e.ContractCode ? `${e.ContractCode} · ` : ''}Bitiş {formatDate(e.PlannedEndDate)}
                        {e.OnSiteQuantity ? ` · sahada ${e.OnSiteQuantity.toLocaleString('tr-TR')} adet` : ''}
                      </div>
                    </div>
                    <Pill color={color}>{formatDaysRemaining(days)}</Pill>
                  </ListButton>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          id="dash-uninvoiced"
          title="Faturalanmamış dönemler"
          icon={<Money size={18} style={{ color: C.warning }} />}
          action={
            d.uninvoicedContractsCount > d.uninvoicedContracts.length ? (
              <span className="text-xs text-text-secondary">
                {d.uninvoicedContracts.length} / {d.uninvoicedContractsCount} gösteriliyor
              </span>
            ) : undefined
          }
        >
          {d.uninvoicedContracts.length === 0 ? (
            <Empty>Tüm aktif kiraların son 30 günü faturalanmış</Empty>
          ) : (
            <>
              <div className="text-xs text-text-secondary mb-2">
                Son faturanın dönem sonundan (fatura yoksa kira başlangıcından) bu yana 30 gün veya fazlası geçmiş aktif kiralar.
              </div>
              <div className="max-h-[310px] overflow-y-auto pr-1">
                {d.uninvoicedContracts.map((u) => (
                  <ListButton key={u.ContractId} onClick={() => openContract(u.ContractId, { initialTab: 'invoices' })}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{u.CustomerName || '—'}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {u.ContractCode ? `${u.ContractCode} · ` : ''}
                        {u.LastInvoicedThrough
                          ? `Son fatura dönemi ${formatDate(u.LastInvoicedThrough)} tarihine kadar`
                          : `Hiç fatura yok · kira başlangıcı ${formatDate(u.RentalStart)}`}
                      </div>
                    </div>
                    <Pill color={u.DaysUninvoiced >= 60 ? C.error : C.warning}>{u.DaysUninvoiced} gün</Pill>
                  </ListButton>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Sevk bekleyen + stok uyarıları + çekler */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          id="dash-shipments"
          title="Sevk bekleyen sözleşmeler"
          icon={<Truck size={18} style={{ color: C.info }} />}
          action={can('shipments_view') ? <PanelLink label="Tümü" onClick={() => navigate('/shipments')} /> : undefined}
        >
          {d.pendingShipments.length === 0 ? (
            <Empty>Sevk bekleyen malzeme yok</Empty>
          ) : (
            <div className="max-h-[320px] overflow-y-auto pr-1">
              {d.pendingShipments.map((s) => {
                const total = s.PendingQuantity + s.ShippedQuantity;
                return (
                  <ListButton
                    key={s.ContractId}
                    onClick={() =>
                      openContract(
                        s.ContractId,
                        can('shipments_create')
                          ? { initialTab: 'shipments', quickAction: { kind: 'createShipment', nonce: Date.now() } }
                          : { initialTab: 'shipments' }
                      )
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{s.CustomerName || '—'}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {s.ContractCode ? `${s.ContractCode} · ` : ''}Başlangıç {formatDate(s.StartDate)}
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: tint(C.neutral, 35) }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${percent(s.ShippedQuantity, total)}%`, backgroundColor: C.info }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{s.PendingQuantity.toLocaleString('tr-TR')}</div>
                      <div className="text-xs text-text-secondary">bekliyor</div>
                    </div>
                  </ListButton>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          id="dash-stock"
          title="Stok uyarıları"
          icon={<Warning size={18} style={{ color: C.error }} />}
          action={
            d.lowStockItems.length > 0 ? (
              <span className="text-xs text-text-secondary">{d.lowStockItems.length} ürün</span>
            ) : undefined
          }
        >
          {d.lowStockItems.length === 0 ? (
            <Empty>Tüm stoklar yeterli</Empty>
          ) : (
            <>
              <div className="text-xs text-text-secondary mb-2">
                Müsait = toplam − kirada − rezerve. Müsait, toplamın %10'undan (en az 5) azsa listelenir.
              </div>
              <div className="max-h-[300px] overflow-y-auto pr-1">
                {d.lowStockItems.map((item) => {
                  const avail = item.AvailableStock ?? 0;
                  return (
                    <ListButton
                      key={item.ItemId}
                      onClick={() => (can('inventory_view') ? navigate(inventoryPath(item.ItemId)) : undefined)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{item.ItemName}</div>
                        <div className="text-xs text-text-secondary mt-0.5 tabular-nums">
                          Toplam {item.TotalStock} · Kirada {item.OnRent}
                          {item.Reserved ? ` · Rezerve ${item.Reserved}` : ''}
                        </div>
                      </div>
                      <Pill color={avail <= 0 ? C.error : C.warning}>
                        {avail < 0 ? `${Math.abs(avail)} eksik` : avail === 0 ? 'Tükendi' : `${avail} müsait`}
                      </Pill>
                    </ListButton>
                  );
                })}
              </div>
            </>
          )}
        </Panel>

        {d.checksDueSoon ? (
          <Panel
            id="dash-checks"
            title="Vadesi yaklaşan çekler"
            icon={<Money size={18} style={{ color: C.info }} />}
            action={<PanelLink label="Çekler" onClick={() => navigate('/checks')} />}
          >
            {d.checksDueSoon.length === 0 ? (
              <Empty>30 gün içinde vadesi gelen portföy çeki yok</Empty>
            ) : (
              <div className="max-h-[320px] overflow-y-auto pr-1">
                {d.checksDueSoon.map((c) => (
                  <ListButton key={c.CheckId} onClick={() => navigate('/checks')}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.CustomerName || c.BankName || '—'}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {c.BankName ? `${c.BankName} · ` : ''}No {c.CheckNumber ?? '—'} · Vade {formatDate(c.DueDate)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{formatMoney(c.Amount, c.Currency ?? 'TRY', 2)}</div>
                      <div className="text-xs" style={{ color: c.DaysRemaining < 0 ? C.error : C.textMuted }}>
                        {c.DaysRemaining < 0
                          ? `${Math.abs(c.DaysRemaining)} gün geçti`
                          : c.DaysRemaining === 0
                            ? 'Bugün'
                            : `${c.DaysRemaining} gün`}
                      </div>
                    </div>
                  </ListButton>
                ))}
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Gelir özeti" icon={<CurrencyCircleDollar size={18} style={{ color: C.purple }} />}>
            <RevenueSummary d={d} />
          </Panel>
        )}
      </div>

      {/* Analiz: en çok kiralanan, en büyük müşteriler, son sözleşmeler */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="En çok kirada olan malzemeler" icon={<Package size={18} className="text-primary" />}>
          {d.topItemsOnRent.length === 0 ? (
            <Empty>Kirada malzeme yok</Empty>
          ) : (
            <div className="space-y-3">
              {d.topItemsOnRent.map((i) => {
                const u = percent(i.OnRent, i.TotalStock);
                return (
                  <button
                    key={i.ItemId}
                    type="button"
                    onClick={() => (can('inventory_view') ? navigate(inventoryPath(i.ItemId)) : undefined)}
                    className="w-full text-left group"
                    title={`Kirada ${i.OnRent} / Toplam ${i.TotalStock}${i.Reserved ? ` · Rezerve ${i.Reserved}` : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm mb-1">
                      <span className="truncate group-hover:text-primary">{i.ItemName}</span>
                      <span className="tabular-nums shrink-0">
                        <span className="font-semibold">{i.OnRent.toLocaleString('tr-TR')}</span>
                        <span className="text-xs text-text-secondary ml-1.5">%{u.toLocaleString('tr-TR')}</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: tint(C.neutral, 35) }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, u)}%`, backgroundColor: u >= 90 ? C.warning : C.primary }}
                      />
                    </div>
                  </button>
                );
              })}
              <div className="text-xs text-text-secondary pt-1">Yüzde: ürünün toplam stoğunun kirada olan kısmı.</div>
            </div>
          )}
        </Panel>

        <Panel title="Sahada en çok malzemesi olan müşteriler" icon={<Users size={18} className="text-primary" />}>
          {d.topCustomers.length === 0 ? (
            <Empty>Aktif kira yok</Empty>
          ) : (
            <div>
              {d.topCustomers.map((c) => (
                <ListButton
                  key={c.CustomerId}
                  onClick={() => (can('customers_view') ? navigate(customerPath(c.CustomerId)) : undefined)}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.CustomerName || '—'}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{c.ActiveContracts} aktif sözleşme</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{c.OnSiteQuantity.toLocaleString('tr-TR')}</div>
                    <div className="text-xs text-text-secondary">
                      %{percent(c.OnSiteQuantity, d.itemsOnRentCount).toLocaleString('tr-TR')} sahadakinin
                    </div>
                  </div>
                </ListButton>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Son sözleşmeler"
          icon={<FileText size={18} className="text-primary" />}
          action={<PanelLink label="Tümü" onClick={() => navigate('/contracts/rental')} />}
        >
          {d.recentContracts.length === 0 ? (
            <Empty>Henüz sözleşme yok</Empty>
          ) : (
            <div>
              {d.recentContracts.map((c) => {
                const isSale = c.Type === 'SALE';
                return (
                  <ListButton key={c.ContractId} onClick={() => openContract(c.ContractId)}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{c.CustomerName || '—'}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {c.ContractCode ? `${c.ContractCode} · ` : ''}
                        {formatDate(c.StartDate)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(c.NetTotal ?? 0, c.Currency ?? 'TRY')}
                      </span>
                      <Pill color={isSale ? C.purple : c.IsCompleted ? C.success : C.primary}>
                        {isSale ? 'Satış' : c.IsCompleted ? 'Kapandı' : 'Kira'}
                      </Pill>
                    </div>
                  </ListButton>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {d.checksDueSoon ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel title="Gelir özeti" icon={<CurrencyCircleDollar size={18} style={{ color: C.purple }} />}>
            <RevenueSummary d={d} />
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function RevenueSummary({ d }: { d: DashboardSummary }) {
  const rows: { l: string; v: ReactNode }[] = [
    { l: 'Toplam (tüm zamanlar)', v: <MoneyValue tryValue={d.totalRevenue} byCurrency={d.totalRevenueByCurrency} /> },
    { l: 'Kira (kapanan)', v: d.rentalRevenue != null ? formatMoney(d.rentalRevenue) : '—' },
    { l: 'Satış', v: d.saleRevenue != null ? formatMoney(d.saleRevenue) : '—' },
    { l: 'Kapanan kira sözleşmesi', v: d.completedContractsCount.toLocaleString('tr-TR') },
    { l: 'Toplam müşteri', v: d.totalCustomersCount.toLocaleString('tr-TR') },
  ];
  return (
    <div className="space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.l} className="flex items-center justify-between gap-2 py-1 border-b border-background-border last:border-0">
          <span className="text-text-secondary">{r.l}</span>
          <span className="font-semibold tabular-nums">{r.v}</span>
        </div>
      ))}
      {hasForeignCurrency(d.totalRevenueByCurrency) ? (
        <div className="text-xs text-text-secondary pt-1">
          Para birimi kırılımı: {formatCurrencyBreakdown(d.totalRevenueByCurrency)}. ₺ karşılığı güncel kurla hesaplanır.
        </div>
      ) : null}
    </div>
  );
}
