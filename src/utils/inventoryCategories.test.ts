import { describe, expect, it } from 'vitest';
import { Inventory, MaterialCategory, SubCategory } from '../models';
import { hydrateInventoryCategories } from './inventoryCategories';

const categories = [
  { CategoryId: 1, CategoryName: 'Cephe İskelesi' },
  { CategoryId: 2, CategoryName: 'Kalıp' },
] as MaterialCategory[];
const subCategories = [{ SubCategoryId: 10, SubCategoryName: 'Dikme', CategoryId: 1 }] as SubCategory[];

describe('hydrateInventoryCategories', () => {
  it('liste DTO ID lerinden kategori ve alt kategori nesnelerini doldurur', () => {
    const [item] = hydrateInventoryCategories(
      [{ ItemId: 5, CategoryIds: [2, 1], SubCategoryIds: [10] } as Inventory],
      categories,
      subCategories
    );
    expect(item.Categories?.map((c) => c.CategoryName)).toEqual(['Kalıp', 'Cephe İskelesi']);
    expect(item.SubCategories?.map((s) => s.SubCategoryName)).toEqual(['Dikme']);
  });

  it('dolu Categories alanına ve bilinmeyen ID lere dokunmaz', () => {
    const full = { ItemId: 6, Categories: [categories[1]], CategoryIds: [1] } as Inventory;
    const unknown = { ItemId: 7, CategoryIds: [99] } as Inventory;
    const [a, b] = hydrateInventoryCategories([full, unknown], categories, subCategories);
    expect(a).toBe(full);
    expect(b.Categories).toEqual([]);
  });
});
