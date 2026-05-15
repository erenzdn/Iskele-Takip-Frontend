import { useEffect } from 'react';
import { useContextMenuApi } from './ContextMenuProvider';
import type { ContextMenuActionHandlers, ContextMenuKey, OpenContextMenuPayload } from './types';

export function useContextMenu() {
  const { openContextMenu, closeContextMenu, isOpen } = useContextMenuApi();

  const open = (payload: OpenContextMenuPayload) => openContextMenu(payload);

  return { openContextMenu: open, closeContextMenu, isOpen };
}

export function useContextMenuHandlers(menuKey: ContextMenuKey, handlers: ContextMenuActionHandlers) {
  const { registerHandlers } = useContextMenuApi();

  useEffect(() => {
    return registerHandlers(menuKey, handlers);
  }, [handlers, menuKey, registerHandlers]);
}
