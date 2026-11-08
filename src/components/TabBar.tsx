import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListIcon, PushPinIcon, XIcon } from '@phosphor-icons/react';
import ConfirmModal from './modals/ConfirmModal';
import { matchAppRoute } from '../routes';
import { tabDisplayTitle, useTabStore, type Tab } from '../store/tabStore';

interface TabContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export function TabBar() {
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const closedStack = useTabStore((state) => state.closedStack);
  const pendingCloseIds = useTabStore((state) => state.pendingCloseIds);
  const setActiveTab = useTabStore((state) => state.setActiveTab);
  const requestClose = useTabStore((state) => state.requestClose);
  const closeOtherTabs = useTabStore((state) => state.closeOtherTabs);
  const closeTabsToRight = useTabStore((state) => state.closeTabsToRight);
  const closeAllTabs = useTabStore((state) => state.closeAllTabs);
  const pinTab = useTabStore((state) => state.pinTab);
  const moveTab = useTabStore((state) => state.moveTab);
  const refreshTab = useTabStore((state) => state.refreshTab);
  const reopenClosedTab = useTabStore((state) => state.reopenClosedTab);
  const activateByIndex = useTabStore((state) => state.activateByIndex);
  const confirmPendingClose = useTabStore((state) => state.confirmPendingClose);
  const dismissPendingClose = useTabStore((state) => state.dismissPendingClose);

  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowQuery, setOverflowQuery] = useState('');
  const tabBarRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  const handleTabClose = useCallback(
    (tabId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      requestClose(tabId);
    },
    [requestClose]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === 'w' && !event.shiftKey) {
        event.preventDefault();
        if (activeTabId) requestClose(activeTabId);
        return;
      }
      if (event.ctrlKey && event.shiftKey && key === 't') {
        event.preventDefault();
        reopenClosedTab();
        return;
      }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault();
        if (tabs.length === 0) return;
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
        return;
      }
      if (event.ctrlKey && !event.shiftKey && key === 'r') {
        event.preventDefault();
        if (activeTabId) refreshTab(activeTabId);
        return;
      }
      if (event.ctrlKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const index = event.key === '9' ? tabs.length - 1 : Number(event.key) - 1;
        activateByIndex(index);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activateByIndex, activeTabId, refreshTab, reopenClosedTab, requestClose, setActiveTab, tabs]);

  useEffect(() => {
    if (!contextMenu && !overflowOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (overflowRef.current && event.target instanceof Node && overflowRef.current.contains(event.target)) {
        return;
      }
      setContextMenu(null);
      setOverflowOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [contextMenu, overflowOpen]);

  useEffect(() => {
    if (!activeTabId || !tabBarRef.current) return;
    const activeTabElement = tabBarRef.current.querySelector(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
    activeTabElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const filteredOverflow = useMemo(() => {
    const query = overflowQuery.trim().toLocaleLowerCase('tr-TR');
    if (!query) return tabs;
    return tabs.filter((tab) => tabDisplayTitle(tab).toLocaleLowerCase('tr-TR').includes(query));
  }, [overflowQuery, tabs]);

  if (tabs.length === 0) return null;

  const pendingCount = pendingCloseIds?.length ?? 0;

  return (
    <>
      <div className="flex-1 min-w-0 h-full flex items-stretch">
        <div
          ref={tabBarRef}
          className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'thin' }}
        >
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onActivate={() => setActiveTab(tab.id)}
              onClose={(event) => handleTabClose(tab.id, event)}
              onContextMenu={(event) => {
                event.preventDefault();
                const menuWidth = 240;
                const menuHeight = 280;
                setOverflowOpen(false);
                setContextMenu({
                  tabId: tab.id,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
                });
              }}
              onDropOn={(sourceId) => moveTab(sourceId, tab.id)}
            />
          ))}
        </div>
        <div className="relative shrink-0 border-l border-background-border" ref={overflowRef}>
          <button
            type="button"
            className="h-full w-10 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-background-hover"
            title="Açık sekmeler"
            onClick={() => {
              setContextMenu(null);
              setOverflowOpen((open) => !open);
              setOverflowQuery('');
            }}
          >
            <ListIcon size={16} />
          </button>
          {overflowOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-background-border bg-background-panel shadow-lg">
              <div className="p-2 border-b border-background-border">
                <input
                  autoFocus
                  value={overflowQuery}
                  onChange={(event) => setOverflowQuery(event.target.value)}
                  placeholder="Sekme ara..."
                  className="w-full rounded-md border border-background-border bg-background-main px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/70"
                />
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {filteredOverflow.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-text-secondary">Sekme bulunamadı</div>
                ) : (
                  filteredOverflow.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-background-hover ${
                        tab.id === activeTabId ? 'text-primary' : 'text-text-primary'
                      }`}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setOverflowOpen(false);
                      }}
                    >
                      <TabIcon tab={tab} />
                      <span className="truncate flex-1">{tabDisplayTitle(tab)}</span>
                      {tab.dirty && <span className="h-2 w-2 rounded-full bg-warning shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 w-60 rounded-lg border border-background-border bg-background-panel py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <MenuButton
            label="Yenile"
            onClick={() => {
              refreshTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          />
          {contextMenu.tabId !== '/' && (
            <MenuButton
              label={tabs.find((tab) => tab.id === contextMenu.tabId)?.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
              onClick={() => {
                const tab = tabs.find((item) => item.id === contextMenu.tabId);
                if (tab) pinTab(tab.id, !tab.pinned);
                setContextMenu(null);
              }}
            />
          )}
          <MenuButton
            label="Kapat"
            disabled={contextMenu.tabId === '/'}
            onClick={() => {
              requestClose(contextMenu.tabId);
              setContextMenu(null);
            }}
          />
          <MenuButton
            label="Sağdakileri kapat"
            onClick={() => {
              closeTabsToRight(contextMenu.tabId);
              setContextMenu(null);
            }}
          />
          <MenuButton
            label="Diğerlerini kapat"
            onClick={() => {
              closeOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
          />
          <MenuButton
            label="Tümünü kapat"
            onClick={() => {
              closeAllTabs();
              setContextMenu(null);
            }}
          />
          <MenuButton
            label="Kapatılan sekmeyi yeniden aç"
            disabled={closedStack.length === 0}
            onClick={() => {
              reopenClosedTab();
              setContextMenu(null);
            }}
          />
        </div>
      )}

      <ConfirmModal
        open={pendingCount > 0}
        title="Kaydedilmemiş değişiklikler"
        message={
          pendingCount > 1
            ? `${pendingCount} sekmede kaydedilmemiş değişiklik var. Kapatılsın mı?`
            : 'Bu sekmede kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?'
        }
        confirmLabel="Kapat"
        cancelLabel="Vazgeç"
        variant="danger"
        zIndexClass="z-[80]"
        onConfirm={confirmPendingClose}
        onCancel={dismissPendingClose}
      />
    </>
  );
}

function MenuButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3 py-1.5 text-left text-sm text-text-primary hover:bg-background-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const matched = matchAppRoute(tab.location.pathname);
  const Icon = matched?.route.meta?.icon;
  if (!Icon) return null;
  return <Icon size={14} weight="regular" />;
}

function TabButton({
  tab,
  isActive,
  onActivate,
  onClose,
  onContextMenu,
  onDropOn,
}: {
  tab: Tab;
  isActive: boolean;
  onActivate: () => void;
  onClose: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onDropOn: (sourceId: string) => void;
}) {
  const isDashboard = tab.id === '/';
  const title = tabDisplayTitle(tab);

  return (
    <div
      data-tab-id={tab.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/tab-id', tab.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData('text/tab-id');
        if (sourceId) onDropOn(sourceId);
      }}
      onContextMenu={onContextMenu}
      onAuxClick={(event) => {
        if (event.button === 1) onClose(event);
      }}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      className={`relative flex items-center gap-1.5 h-full border-r border-background-border shrink-0 group ${
        tab.pinned ? 'px-2' : 'px-3 max-w-[220px]'
      } ${
        isActive
          ? 'bg-background-main text-text-primary'
          : 'bg-background-panel text-text-secondary hover:bg-background-hover hover:text-text-primary'
      }`}
    >
      <button type="button" onClick={onActivate} className="flex min-w-0 items-center gap-1.5 h-full" title={title}>
        {tab.pinned ? <PushPinIcon size={12} weight="fill" className="shrink-0 text-primary" /> : <TabIcon tab={tab} />}
        <span className={`text-sm font-medium truncate ${tab.pinned ? 'max-w-[140px]' : ''}`}>{title}</span>
        {tab.dirty && <span className="h-2 w-2 rounded-full bg-warning shrink-0" title="Kaydedilmemiş değişiklik" />}
      </button>
      {!isDashboard && (
        <button
          type="button"
          onClick={onClose}
          className={`h-5 w-5 rounded flex items-center justify-center transition-colors ${
            isActive ? 'hover:bg-background-hover' : 'opacity-0 group-hover:opacity-100 hover:bg-background-hover'
          }`}
          title="Kapat"
        >
          <XIcon size={12} weight="bold" />
        </button>
      )}
      {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
    </div>
  );
}
