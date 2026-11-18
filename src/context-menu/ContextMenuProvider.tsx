import { CaretRightIcon } from '@phosphor-icons/react';
import {
  Fragment,
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
  /** Menüyü açan ekranın işlemleri (payload.handlers) */
  handlers: ContextMenuActionHandlers | null;
}

interface PendingConfirm {
  action: ContextMenuActionConfig;
  menuKey: ContextMenuKey;
  target: ContextMenuTarget;
  handlers: ContextMenuActionHandlers | null;
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
  handlers: null,
};

const ContextMenuContext = createContext<ContextMenuApi | null>(null);
const SAFE_MARGIN = 12;

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const [state, setState] = useState<InternalState>(initialState);
  const [submenuPath, setSubmenuPath] = useState<string[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const handlersRef = useRef<Map<ContextMenuKey, ContextMenuActionHandlers>>(new Map());
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const closeContextMenu = useCallback(() => {
    setState(initialState);
    setSubmenuPath([]);
    setPendingConfirm(null);
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
    setPendingConfirm(null);
    setConfirmBusy(false);
    setState({
      isOpen: true,
      x: payload.x,
      y: payload.y,
      menuKey: payload.menuKey,
      target: payload.target,
      env: payload.env ?? null,
      handlers: payload.handlers ?? null,
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
    return resolveContextMenuActions(
      state.menuKey,
      state.target,
      { permissions, ...(state.env ?? {}) },
      state.handlers ? new Set(Object.keys(state.handlers)) : undefined
    );
  }, [permissions, state.env, state.handlers, state.menuKey, state.target]);

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

  useEffect(() => {
    if (!pendingConfirm || confirmBusy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeContextMenu, confirmBusy, pendingConfirm]);

  const executeAction = useCallback(
    async (action: ContextMenuActionConfig) => {
      if (!state.menuKey || !state.target || !action.handlerKey) return;
      const handlers = state.handlers ?? handlersRef.current.get(state.menuKey) ?? null;
      const fn = handlers?.[action.handlerKey as ContextMenuActionHandlerKey];
      if (!fn) return;
      if (action.confirm) {
        setPendingConfirm({
          action,
          menuKey: state.menuKey,
          target: state.target,
          handlers,
        });
        // Menüyü kapat; onay tıklaması "dışarı tık" sayılmasın.
        setState(initialState);
        setSubmenuPath([]);
        return;
      }
      await Promise.resolve(fn(state.target));
      closeContextMenu();
    },
    [closeContextMenu, state.handlers, state.menuKey, state.target]
  );

  const executeConfirmedAction = useCallback(async () => {
    if (!pendingConfirm?.action.handlerKey) return;
    const handlers = pendingConfirm.handlers ?? handlersRef.current.get(pendingConfirm.menuKey);
    const fn = handlers?.[pendingConfirm.action.handlerKey];
    if (!fn) return;
    try {
      setConfirmBusy(true);
      await Promise.resolve(fn(pendingConfirm.target));
      closeContextMenu();
    } finally {
      setConfirmBusy(false);
    }
  }, [closeContextMenu, pendingConfirm]);

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
            className="ctx-menu fixed z-[210] min-w-[220px] max-w-[320px]"
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
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.action.confirm?.title ?? 'Onay gerekiyor'}
        message={
          pendingConfirm?.action.confirm
            ? pendingConfirm.action.confirm.message(pendingConfirm.target)
            : ''
        }
        confirmLabel={pendingConfirm?.action.confirm?.confirmLabel ?? 'Onayla'}
        variant={pendingConfirm?.action.intent === 'danger' ? 'danger' : 'default'}
        loading={confirmBusy}
        zIndexClass="z-[220]"
        onCancel={closeContextMenu}
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
      {actions.map((action, index) => {
        const hasChildren = Boolean(action.children?.length);
        const isOpen = submenuPath[level] === action.id;

        return (
          <Fragment key={`${level}-${action.id}`}>
            {action.separatorBefore && index > 0 && (
              <div role="separator" className="ctx-menu-separator" />
            )}
            <div className="relative">
              <button
                type="button"
                role="menuitem"
                disabled={action.disabled}
                aria-haspopup={hasChildren ? 'menu' : undefined}
                aria-expanded={hasChildren ? isOpen : undefined}
                className={`ctx-menu-item ${action.intent === 'danger' ? 'ctx-menu-item--danger' : ''}`}
                title={action.disabled && action.hintText ? action.hintText : undefined}
                onMouseEnter={() => {
                  if (hasChildren && !action.disabled) {
                    setSubmenuPath([...submenuPath.slice(0, level), action.id]);
                  } else if (submenuPath.length > level) {
                    // Alt menüsü olmayan bir öğeye geçince açık alt menüyü kapat
                    setSubmenuPath(submenuPath.slice(0, level));
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' && hasChildren && !action.disabled) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSubmenuPath([...submenuPath.slice(0, level), action.id]);
                    const wrapper = event.currentTarget.parentElement;
                    requestAnimationFrame(() => {
                      wrapper
                        ?.querySelector<HTMLButtonElement>(':scope > [role="menu"] [role="menuitem"]:not(:disabled)')
                        ?.focus();
                    });
                  } else if (event.key === 'ArrowLeft' && level > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSubmenuPath(submenuPath.slice(0, level - 1));
                    const parentButton = event.currentTarget
                      .closest('[role="menu"]')
                      ?.parentElement?.querySelector<HTMLButtonElement>(':scope > [role="menuitem"]');
                    parentButton?.focus();
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
                <span className="ctx-menu-icon inline-flex w-4 shrink-0 items-center justify-center">{action.icon}</span>
                <span className="flex-1 truncate text-left">{action.label}</span>
                {action.hintText && (
                  <span className="ctx-menu-hint shrink-0 text-[11px]">{action.hintText}</span>
                )}
                {hasChildren && <CaretRightIcon size={14} className="ctx-menu-icon shrink-0" />}
              </button>
              {hasChildren && isOpen && action.children && (
                <div
                  role="menu"
                  className="ctx-menu absolute left-full -top-1 ml-1.5 min-w-[200px]"
                >
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
          </Fragment>
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
