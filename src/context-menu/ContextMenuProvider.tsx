import { CaretRightIcon } from '@phosphor-icons/react';
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
import { createPortal } from 'react-dom';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useAuthStore } from '../store/authStore';
import { resolveContextMenuActions } from './contextMenuRegistry';
import type {
  ContextMenuActionConfig,
  ContextMenuActionHandlerKey,
  ContextMenuActionHandlers,
  ContextMenuEnvironment,
  ContextMenuKey,
  ContextMenuTarget,
  OpenContextMenuPayload,
} from './types';

interface InternalState {
  isOpen: boolean;
  x: number;
  y: number;
  menuKey: ContextMenuKey | null;
  target: ContextMenuTarget | null;
  env: Partial<ContextMenuEnvironment> | null;
}

interface ContextMenuApi {
  isOpen: boolean;
  openContextMenu: (payload: OpenContextMenuPayload) => void;
  closeContextMenu: () => void;
  registerHandlers: (menuKey: ContextMenuKey, handlers: ContextMenuActionHandlers) => () => void;
}

const initialState: InternalState = {
  isOpen: false,
  x: 0,
  y: 0,
  menuKey: null,
  target: null,
  env: null,
};

const ContextMenuContext = createContext<ContextMenuApi | null>(null);
const SAFE_MARGIN = 12;

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const [state, setState] = useState<InternalState>(initialState);
  const [submenuPath, setSubmenuPath] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<ContextMenuActionConfig | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const handlersRef = useRef<Map<ContextMenuKey, ContextMenuActionHandlers>>(new Map());
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const closeContextMenu = useCallback(() => {
    setState(initialState);
    setSubmenuPath([]);
    setConfirmAction(null);
    setConfirmBusy(false);
    if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, []);

  const openContextMenu = useCallback((payload: OpenContextMenuPayload) => {
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement ? active : null;
    setSubmenuPath([]);
    setConfirmAction(null);
    setState({
      isOpen: true,
      x: payload.x,
      y: payload.y,
      menuKey: payload.menuKey,
      target: payload.target,
      env: payload.env ?? null,
    });
  }, []);

  const registerHandlers = useCallback((menuKey: ContextMenuKey, handlers: ContextMenuActionHandlers) => {
    handlersRef.current.set(menuKey, handlers);
    return () => {
      handlersRef.current.delete(menuKey);
    };
  }, []);

  const actions = useMemo(() => {
    if (!state.menuKey || !state.target) return [];
    return resolveContextMenuActions(state.menuKey, state.target, { permissions, ...(state.env ?? {}) });
  }, [permissions, state.env, state.menuKey, state.target]);

  useEffect(() => {
    if (!state.isOpen) return;
    const node = menuRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - SAFE_MARGIN;
    const maxY = window.innerHeight - rect.height - SAFE_MARGIN;
    setPosition({
      x: Math.max(SAFE_MARGIN, Math.min(state.x, maxX)),
      y: Math.max(SAFE_MARGIN, Math.min(state.y, maxY)),
    });
  }, [actions, state.isOpen, state.x, state.y]);

  useEffect(() => {
    if (!state.isOpen) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
  }, [actions, state.isOpen]);

  useEffect(() => {
    if (!state.isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeContextMenu();
    };
    const onResizeOrScroll = () => closeContextMenu();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
      );
      if (menuItems.length === 0) return;
      const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
      const nextIndex =
        event.key === 'ArrowDown'
          ? (currentIndex + 1 + menuItems.length) % menuItems.length
          : (currentIndex - 1 + menuItems.length) % menuItems.length;
      menuItems[nextIndex]?.focus();
      event.preventDefault();
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closeContextMenu, state.isOpen]);

  const executeAction = useCallback(
    async (action: ContextMenuActionConfig) => {
      if (!state.menuKey || !state.target || !action.handlerKey) return;
      const handlers = handlersRef.current.get(state.menuKey);
      const fn = handlers?.[action.handlerKey as ContextMenuActionHandlerKey];
      if (!fn) return;
      if (action.confirm) {
        setConfirmAction(action);
        return;
      }
      await Promise.resolve(fn(state.target));
      closeContextMenu();
    },
    [closeContextMenu, state.menuKey, state.target]
  );

  const executeConfirmedAction = useCallback(async () => {
    if (!confirmAction || !state.menuKey || !state.target || !confirmAction.handlerKey) return;
    const handlers = handlersRef.current.get(state.menuKey);
    const fn = handlers?.[confirmAction.handlerKey];
    if (!fn) return;
    try {
      setConfirmBusy(true);
      await Promise.resolve(fn(state.target));
      closeContextMenu();
    } finally {
      setConfirmBusy(false);
    }
  }, [closeContextMenu, confirmAction, state.menuKey, state.target]);

  const api = useMemo<ContextMenuApi>(
    () => ({
      isOpen: state.isOpen,
      openContextMenu,
      closeContextMenu,
      registerHandlers,
    }),
    [closeContextMenu, openContextMenu, registerHandlers, state.isOpen]
  );

  return (
    <ContextMenuContext.Provider value={api}>
      {children}
      {state.isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[210] min-w-[220px] max-w-[320px] rounded-lg border border-background-border bg-background-panel/95 py-1 shadow-xl backdrop-blur-sm"
            style={{ left: position.x, top: position.y }}
            role="menu"
          >
            <MenuItems
              actions={actions}
              level={0}
              submenuPath={submenuPath}
              setSubmenuPath={setSubmenuPath}
              onAction={executeAction}
            />
          </div>,
          document.body
        )}
      <ConfirmModal
        open={Boolean(confirmAction && state.target)}
        title={confirmAction?.confirm?.title ?? 'Onay gerekiyor'}
        message={state.target && confirmAction?.confirm ? confirmAction.confirm.message(state.target) : ''}
        confirmLabel={confirmAction?.confirm?.confirmLabel ?? 'Onayla'}
        variant={confirmAction?.intent === 'danger' ? 'danger' : 'default'}
        loading={confirmBusy}
        zIndexClass="z-[220]"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void executeConfirmedAction();
        }}
      />
    </ContextMenuContext.Provider>
  );
}

function MenuItems({
  actions,
  level,
  submenuPath,
  setSubmenuPath,
  onAction,
}: {
  actions: ContextMenuActionConfig[];
  level: number;
  submenuPath: string[];
  setSubmenuPath: (path: string[]) => void;
  onAction: (action: ContextMenuActionConfig) => void | Promise<void>;
}) {
  return (
    <>
      {actions.map((action) => {
        const hasChildren = Boolean(action.children?.length);
        const isOpen = submenuPath[level] === action.id;
        const classes =
          action.intent === 'danger'
            ? 'text-text-primary hover:bg-red-500/10 hover:text-red-400'
            : 'text-text-primary hover:bg-background-hover';

        return (
          <div key={`${level}-${action.id}`} className="relative">
            <button
              type="button"
              role="menuitem"
              disabled={action.disabled}
              className={`flex h-9 w-full items-center gap-2 px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
              onMouseEnter={() => {
                if (action.disabled) return;
                if (hasChildren) {
                  const next = [...submenuPath.slice(0, level), action.id];
                  setSubmenuPath(next);
                }
              }}
              onClick={() => {
                if (action.disabled) return;
                if (hasChildren) {
                  const next = [...submenuPath.slice(0, level), action.id];
                  setSubmenuPath(next);
                  return;
                }
                void onAction(action);
              }}
            >
              <span className="inline-flex w-4 items-center justify-center text-text-secondary">{action.icon}</span>
              <span className="flex-1 text-left">{action.label}</span>
              {hasChildren && <CaretRightIcon size={14} className="text-text-secondary" />}
            </button>
            {hasChildren && isOpen && action.children && (
              <div className="absolute left-full top-0 ml-1 min-w-[200px] rounded-lg border border-background-border bg-background-panel py-1 shadow-xl">
                <MenuItems
                  actions={action.children}
                  level={level + 1}
                  submenuPath={submenuPath}
                  setSubmenuPath={setSubmenuPath}
                  onAction={onAction}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function useContextMenuApi() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenuApi must be used inside ContextMenuProvider');
  }
  return context;
}
