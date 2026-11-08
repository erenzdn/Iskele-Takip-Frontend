import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/authService', () => ({ authService: { logoutAsync: vi.fn() } }));

import { DASHBOARD_TAB_ID, useTabStore, type TabLocation } from './tabStore';

function loc(path: string, state: unknown = null): TabLocation {
  const [pathAndSearch, hash = ''] = path.split('#');
  const [pathname, search = ''] = pathAndSearch.split('?');
  return { pathname, search: search ? `?${search}` : '', hash: hash ? `#${hash}` : '', state };
}

const ids = () => useTabStore.getState().tabs.map((tab) => tab.id);
const active = () => useTabStore.getState().activeTabId;
const tab = (id: string) => useTabStore.getState().tabs.find((item) => item.id === id);

beforeEach(() => {
  useTabStore.setState({
    tabs: [
      {
        id: DASHBOARD_TAB_ID,
        title: 'Dashboard',
        customTitle: null,
        pinned: true,
        dirty: false,
        refreshKey: 0,
        location: loc('/'),
        lastAccessTime: 0,
      },
    ],
    activeTabId: DASHBOARD_TAB_ID,
    closedStack: [],
    pendingCloseIds: null,
  });
});

describe('openLocation (sekme dışı gezinme)', () => {
  it('yeni sekme açar ve aktif yapar', () => {
    useTabStore.getState().openLocation(loc('/customers'));
    expect(ids()).toEqual(['/', '/customers']);
    expect(active()).toBe('/customers');
  });

  it('yönlendirme rotalarını çözer', () => {
    useTabStore.getState().openLocation(loc('/contracts'));
    expect(active()).toBe('/contracts/rental');

    useTabStore.getState().openLocation(loc('/contract-management'));
    expect(active()).toBe('/document-templates');
    expect(tab('/document-templates')?.location.search).toBe('?tab=contract');
  });

  it('bilinmeyen adresi Dashboard a yönlendirir', () => {
    useTabStore.getState().openLocation(loc('/customers'));
    useTabStore.getState().openLocation(loc('/olmayan/sayfa'));
    expect(active()).toBe(DASHBOARD_TAB_ID);
    expect(ids()).toEqual(['/', '/customers']);
  });

  it('yalın bağlantı mevcut sekmenin konumunu ezmez', () => {
    useTabStore.getState().openLocation(loc('/inventory?stockStatus=onRent'));
    useTabStore.getState().openLocation(loc('/'));
    useTabStore.getState().openLocation(loc('/inventory'));
    expect(active()).toBe('/inventory');
    expect(tab('/inventory')?.location.search).toBe('?stockStatus=onRent');
  });

  it('aynı aktif sekmeye tekrar gitmek durumu değiştirmez', () => {
    useTabStore.getState().openLocation(loc('/customers'));
    const before = useTabStore.getState().tabs;
    useTabStore.getState().openLocation(loc('/customers'));
    expect(useTabStore.getState().tabs).toBe(before);
  });
});

describe('navigateInTab (sekme içi gezinme)', () => {
  it('push yeni sekmeyi kaynağın sağında açar', () => {
    const store = useTabStore.getState();
    store.openLocation(loc('/customers'));
    store.openLocation(loc('/inventory'));
    store.setActiveTab('/customers');
    useTabStore.getState().navigateInTab('/customers', loc('/customers/5', { initialTab: 'sites' }), 'push');
    expect(ids()).toEqual(['/', '/customers', '/customers/5', '/inventory']);
    expect(active()).toBe('/customers/5');
    expect(tab('/customers/5')?.location.state).toEqual({ initialTab: 'sites' });
  });

  it('arka plan sekmesinden push odağı çalmaz', () => {
    const store = useTabStore.getState();
    store.openLocation(loc('/contracts/new?type=rental'));
    store.openLocation(loc('/inventory'));
    useTabStore.getState().navigateInTab('/contracts/new?type=rental', loc('/quotes/9'), 'push');
    expect(active()).toBe('/inventory');
    expect(ids()).toContain('/quotes/9');
  });

  it('aynı sekmede sorgu değişikliği yalnızca konumu günceller', () => {
    useTabStore.getState().openLocation(loc('/document-templates?tab=quote'));
    useTabStore.getState().navigateInTab('/document-templates', loc('/document-templates?tab=contract'), 'push');
    expect(ids()).toEqual(['/', '/document-templates']);
    expect(tab('/document-templates')?.location.search).toBe('?tab=contract');
  });

  it('replace "yeni kayıt" sekmesini kaydedilen kayda dönüştürür', () => {
    useTabStore.getState().openLocation(loc('/customers/new'));
    useTabStore.getState().setTabDirty('/customers/new', true);
    useTabStore.getState().navigateInTab('/customers/new', loc('/customers/12'), 'replace');
    expect(ids()).toEqual(['/', '/customers/12']);
    expect(active()).toBe('/customers/12');
    expect(tab('/customers/12')?.dirty).toBe(false);
  });

  it('arka planda tamamlanan replace aktif sekmeyi değiştirmez', () => {
    useTabStore.getState().openLocation(loc('/contracts/new?type=sale'));
    useTabStore.getState().openLocation(loc('/customers'));
    useTabStore.getState().navigateInTab('/contracts/new?type=sale', loc('/contracts/44'), 'replace');
    expect(active()).toBe('/customers');
    expect(ids()).toEqual(['/', '/contracts/44', '/customers']);
  });

  it('replace hedefi zaten açıksa kaynak sekme kapanır', () => {
    useTabStore.getState().openLocation(loc('/warehouses'));
    useTabStore.getState().openLocation(loc('/warehouses/abc'));
    useTabStore.getState().navigateInTab('/warehouses/abc', loc('/warehouses'), 'replace');
    expect(ids()).toEqual(['/', '/warehouses']);
    expect(active()).toBe('/warehouses');
  });

  it('Dashboard replace ile kapanmaz', () => {
    useTabStore.getState().navigateInTab('/', loc('/customers'), 'replace');
    expect(ids()).toEqual(['/', '/customers']);
  });
});

describe('kapatma', () => {
  it('toplu kapatma sabitlenmiş sekmeleri korur', () => {
    const store = useTabStore.getState();
    store.openLocation(loc('/customers'));
    store.openLocation(loc('/inventory'));
    store.openLocation(loc('/cash'));
    useTabStore.getState().pinTab('/inventory', true);
    useTabStore.getState().closeAllTabs();
    expect(ids()).toEqual(['/', '/inventory']);
  });

  it('kaydedilmemiş sekme için onay ister', () => {
    useTabStore.getState().openLocation(loc('/customers/new'));
    useTabStore.getState().setTabDirty('/customers/new', true);
    useTabStore.getState().requestClose('/customers/new');
    expect(useTabStore.getState().pendingCloseIds).toEqual(['/customers/new']);
    useTabStore.getState().confirmPendingClose();
    expect(ids()).toEqual(['/']);
    expect(active()).toBe('/');
  });

  it('değişmeyen dirty/başlık güncellemesi yeni durum üretmez', () => {
    useTabStore.getState().openLocation(loc('/customers'));
    const before = useTabStore.getState().tabs;
    useTabStore.getState().setTabDirty('/customers', false);
    useTabStore.getState().setTabTitle('/customers', null);
    expect(useTabStore.getState().tabs).toBe(before);
  });
});
