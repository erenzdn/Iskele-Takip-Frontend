import { useEffect, useMemo, useState } from 'react';
import { ArrowClockwiseIcon, CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import type { MaterialCategory } from '../models';
import type {
  CategoryResolutionAction,
  CategoryResolutionDecision,
  UnmatchedCategoryLookup,
} from '../types/inventoryExcelImport';
import {
  isResolutionComplete,
  normalizeCategoryKey,
  suggestCategoryMatch,
} from '../utils/unmatchedCategoryResolution';

interface UnmatchedCategoryResolutionPanelProps {
  unmatchedCategories: UnmatchedCategoryLookup[];
  categories: MaterialCategory[];
  canCreateCategories: boolean;
  skippedNames?: string[];
  busy?: boolean;
  onApply: (decisions: CategoryResolutionDecision[]) => void;
}

type DraftDecision = {
  action: CategoryResolutionAction | '';
  createName: string;
  mapCategoryId: number | '';
};

function emptyDraft(excelName: string): DraftDecision {
  return { action: '', createName: excelName, mapCategoryId: '' };
}

export default function UnmatchedCategoryResolutionPanel({
  unmatchedCategories,
  categories,
  canCreateCategories,
  skippedNames = [],
  busy = false,
  onApply,
}: UnmatchedCategoryResolutionPanelProps) {
  const skippedKeys = useMemo(
    () => new Set(skippedNames.map((name) => normalizeCategoryKey(name))),
    [skippedNames]
  );

  const suggestions = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestCategoryMatch>>();
    for (const item of unmatchedCategories) {
      map.set(item.value, suggestCategoryMatch(item.value, categories));
    }
    return map;
  }, [unmatchedCategories, categories]);

  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, DraftDecision> = {};
      for (const item of unmatchedCategories) {
        const existing = prev[item.value];
        if (existing) {
          next[item.value] = existing;
          continue;
        }
        const draft = emptyDraft(item.value);
        if (skippedKeys.has(normalizeCategoryKey(item.value))) {
          draft.action = 'skip';
        } else {
          const suggestion = suggestions.get(item.value);
          if (suggestion && suggestion.score >= 0.85) {
            draft.action = 'map';
            draft.mapCategoryId = suggestion.CategoryId;
          }
        }
        next[item.value] = draft;
      }
      return next;
    });
  }, [unmatchedCategories, skippedKeys, suggestions]);

  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) =>
        (a.CategoryName ?? '').localeCompare(b.CategoryName ?? '', 'tr-TR')
      ),
    [categories]
  );

  const allChosen = unmatchedCategories.every((item) => {
    const draft = drafts[item.value];
    if (!draft?.action) return false;
    return isResolutionComplete({
      excelName: item.value,
      action: draft.action,
      createName: draft.createName,
      mapCategoryId: draft.mapCategoryId === '' ? undefined : Number(draft.mapCategoryId),
    });
  });

  const updateDraft = (excelName: string, patch: Partial<DraftDecision>) => {
    setDrafts((prev) => ({
      ...prev,
      [excelName]: { ...(prev[excelName] ?? emptyDraft(excelName)), ...patch },
    }));
  };

  const applyCreateAll = () => {
    if (!canCreateCategories) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of unmatchedCategories) {
        next[item.value] = {
          ...(next[item.value] ?? emptyDraft(item.value)),
          action: 'create',
          createName: (next[item.value]?.createName || item.value).trim() || item.value,
        };
      }
      return next;
    });
  };

  const handleApply = () => {
    if (!allChosen || busy) return;
    onApply(
      unmatchedCategories.map((item) => {
        const draft = drafts[item.value] ?? emptyDraft(item.value);
        return {
          excelName: item.value,
          action: draft.action as CategoryResolutionAction,
          createName: draft.createName.trim() || item.value,
          mapCategoryId: draft.mapCategoryId === '' ? undefined : Number(draft.mapCategoryId),
        };
      })
    );
  };

  if (unmatchedCategories.length === 0) return null;

  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <WarningCircleIcon size={16} className="text-accent" />
            Eşleşmeyen kategoriler
          </h4>
          <p className="text-xs text-text-secondary mt-1">
            Excel’deki kategori adları sistemde yok. Kayıt etmeden önce oluşturun, mevcut bir kategoriye
            eşleyin veya bu satırları atlayın.
          </p>
        </div>
        {canCreateCategories && (
          <button
            type="button"
            disabled={busy}
            onClick={applyCreateAll}
            className="btn-secondary py-1 px-2 text-[11px]"
          >
            Tümünü oluştur
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {unmatchedCategories.map((item) => {
          const draft = drafts[item.value] ?? emptyDraft(item.value);
          const suggestion = suggestions.get(item.value);
          return (
            <div
              key={item.value}
              className="rounded-md border border-background-border bg-background-panel p-2.5 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-text-primary">{item.value}</div>
                  <div className="text-[11px] text-text-secondary">
                    {item.rowCount} satır
                    {item.reason === 'ambiguous' ? ' · birden fazla eşleşme' : ''}
                    {suggestion ? ` · öneri: ${suggestion.CategoryName}` : ''}
                  </div>
                </div>
                <select
                  value={draft.action}
                  disabled={busy}
                  onChange={(e) =>
                    updateDraft(item.value, { action: e.target.value as CategoryResolutionAction | '' })
                  }
                  className="input text-xs py-1 px-2 border border-background-border rounded bg-background-panel min-w-[9.5rem]"
                  aria-label={`${item.value} için karar`}
                >
                  <option value="">Karar seçin</option>
                  {canCreateCategories && <option value="create">Yeni kategori oluştur</option>}
                  <option value="map">Mevcut kategoriye eşle</option>
                  <option value="skip">Bu satırları atla</option>
                </select>
              </div>

              {draft.action === 'create' && (
                <label className="block text-[11px] text-text-secondary">
                  Kategori adı
                  <input
                    value={draft.createName}
                    disabled={busy}
                    onChange={(e) => updateDraft(item.value, { createName: e.target.value })}
                    className="input mt-1 w-full text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                  />
                </label>
              )}

              {draft.action === 'map' && (
                <label className="block text-[11px] text-text-secondary">
                  Hedef kategori
                  <select
                    value={draft.mapCategoryId}
                    disabled={busy}
                    onChange={(e) =>
                      updateDraft(item.value, {
                        mapCategoryId: e.target.value ? Number(e.target.value) : '',
                      })
                    }
                    className="input mt-1 w-full text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                  >
                    <option value="">Kategori seçin</option>
                    {sortedCategories.map((category) => (
                      <option key={category.CategoryId} value={category.CategoryId}>
                        {category.CategoryName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {draft.action === 'skip' && (
                <p className="text-[11px] text-text-secondary">
                  Bu kategoriye ait satırlar sorunlu kalır; isterseniz yalnızca geçerli satırları yükleyebilirsiniz.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy || !allChosen}
          onClick={handleApply}
          className="btn-primary py-1.5 px-3 text-xs inline-flex items-center gap-1.5"
        >
          {busy ? (
            <ArrowClockwiseIcon size={14} className="animate-spin shrink-0" />
          ) : (
            <CheckCircleIcon size={14} weight="bold" />
          )}
          Uygula ve yeniden doğrula
        </button>
      </div>
    </div>
  );
}
