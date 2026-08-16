import type {
  CategoryResolutionDecision,
  InventoryCategoryMapping,
  UnmatchedCategoryLookup,
} from '../types/inventoryExcelImport';

export interface CategoryOption {
  CategoryId: number;
  CategoryName: string;
}

export interface CategoryMatchSuggestion {
  CategoryId: number;
  CategoryName: string;
  score: number;
}

const CATEGORY_COLUMNS = new Set(['Kategori', 'CategoryName', 'CategoryId', 'Kategori ID']);

export function normalizeCategoryKey(name: string): string {
  return String(name ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function suggestCategoryMatch(
  excelName: string,
  categories: CategoryOption[],
  minScore = 0.72
): CategoryMatchSuggestion | null {
  const key = normalizeCategoryKey(excelName);
  if (!key) return null;

  let best: CategoryMatchSuggestion | null = null;
  for (const category of categories) {
    const catKey = normalizeCategoryKey(category.CategoryName);
    if (!catKey) continue;

    let score = 0;
    if (catKey === key) score = 1;
    else if (catKey.includes(key) || key.includes(catKey)) {
      const shorter = Math.min(catKey.length, key.length);
      const longer = Math.max(catKey.length, key.length);
      score = 0.78 + (shorter / longer) * 0.17;
    } else {
      const distance = levenshtein(key, catKey);
      score = 1 - distance / Math.max(key.length, catKey.length);
    }

    if (!best || score > best.score) {
      best = {
        CategoryId: category.CategoryId,
        CategoryName: category.CategoryName,
        score,
      };
    }
  }

  if (!best || best.score < minScore) return null;
  return best;
}

export function extractUnmatchedCategories(input: {
  unmatchedLookups?: { categories?: UnmatchedCategoryLookup[] } | null;
  errorsByRow?: Array<{
    row: number;
    issues: Array<{
      column?: string;
      code?: string | null;
      error?: string;
      givenValue?: string | null;
    }>;
  }>;
}): UnmatchedCategoryLookup[] {
  const fromApi = input.unmatchedLookups?.categories;
  if (Array.isArray(fromApi) && fromApi.length > 0) {
    return [...fromApi].sort((a, b) => a.value.localeCompare(b.value, 'tr-TR'));
  }

  const byKey = new Map<string, UnmatchedCategoryLookup>();
  for (const row of input.errorsByRow ?? []) {
    for (const issue of row.issues ?? []) {
      const column = String(issue.column ?? '').trim();
      if (!CATEGORY_COLUMNS.has(column)) continue;
      const message = String(issue.error ?? '');
      const code = String(issue.code ?? '');
      const isLookupError =
        code === 'CATEGORY_NOT_FOUND' ||
        code === 'CATEGORY_AMBIGUOUS' ||
        message.includes('adında kategori bulunamadı') ||
        message.includes('birden fazla kategoriyle eşleşiyor');
      if (!isLookupError) continue;

      const value = String(issue.givenValue ?? '').trim();
      if (!value) continue;
      const key = normalizeCategoryKey(value);
      if (!byKey.has(key)) {
        byKey.set(key, {
          value,
          rowCount: 0,
          rows: [],
          reason: code === 'CATEGORY_AMBIGUOUS' || message.includes('birden fazla kategoriyle eşleşiyor')
            ? 'ambiguous'
            : 'not_found',
        });
      }
      const entry = byKey.get(key);
      if (!entry) continue;
      entry.rowCount += 1;
      if (Number.isFinite(row.row)) entry.rows.push(row.row);
    }
  }

  return [...byKey.values()].sort((a, b) => a.value.localeCompare(b.value, 'tr-TR'));
}

export function decisionsToMappings(
  decisions: CategoryResolutionDecision[]
): InventoryCategoryMapping[] {
  const mappings: InventoryCategoryMapping[] = [];
  for (const decision of decisions) {
    const from = decision.excelName.trim();
    if (!from) continue;
    if (decision.action === 'map' && decision.mapCategoryId && decision.mapCategoryId > 0) {
      mappings.push({ from, toCategoryId: decision.mapCategoryId });
    }
  }
  return mappings;
}

export function mergeCategoryMappings(
  current: InventoryCategoryMapping[],
  incoming: InventoryCategoryMapping[]
): InventoryCategoryMapping[] {
  const byKey = new Map<string, InventoryCategoryMapping>();
  for (const mapping of [...current, ...incoming]) {
    const key = normalizeCategoryKey(mapping.from);
    if (!key) continue;
    byKey.set(key, mapping);
  }
  return [...byKey.values()];
}

export function isResolutionComplete(decision: CategoryResolutionDecision): boolean {
  if (decision.action === 'skip') return true;
  if (decision.action === 'create') return Boolean(decision.createName?.trim());
  if (decision.action === 'map') return Boolean(decision.mapCategoryId && decision.mapCategoryId > 0);
  return false;
}
