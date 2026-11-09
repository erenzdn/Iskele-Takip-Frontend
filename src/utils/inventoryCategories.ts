import { Inventory, MaterialCategory, SubCategory } from '../models';

/**
 * GET /inventory (lean liste DTO) kategorileri yalnızca `CategoryIds` / `SubCategoryIds`
 * olarak döner. Kategori adı / alt kategori bilgisine ihtiyaç duyan ekranlar için
 * bu ID'leri tam `Categories` / `SubCategories` nesnelerine çevirir.
 * Zaten dolu olan alanlara dokunmaz.
 */
export function hydrateInventoryCategories<T extends Inventory>(
  items: T[],
  categories: MaterialCategory[],
  subCategories: SubCategory[]
): T[] {
  if (items.length === 0) return items;
  const categoryById = new Map(categories.map((c) => [c.CategoryId, c] as const));
  const subCategoryById = new Map(subCategories.map((s) => [s.SubCategoryId, s] as const));

  return items.map((item) => {
    const needsCategories = !item.Categories?.length && (item.CategoryIds?.length ?? 0) > 0;
    const needsSubCategories = !item.SubCategories?.length && (item.SubCategoryIds?.length ?? 0) > 0;
    if (!needsCategories && !needsSubCategories) return item;

    return {
      ...item,
      Categories: needsCategories
        ? (item.CategoryIds ?? [])
            .map((id) => categoryById.get(id))
            .filter((c): c is MaterialCategory => c != null)
        : item.Categories,
      SubCategories: needsSubCategories
        ? (item.SubCategoryIds ?? [])
            .map((id) => subCategoryById.get(id))
            .filter((s): s is SubCategory => s != null)
        : item.SubCategories,
    };
  });
}
