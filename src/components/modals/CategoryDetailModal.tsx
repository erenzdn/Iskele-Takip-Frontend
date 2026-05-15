import { useState, useEffect } from 'react';
import { MaterialCategory, SubCategory } from '../../models';
import { inventoryService } from '../../services/inventoryService';
import { subcategoryService } from '../../services/subcategoryService';
import ConfirmModal from './ConfirmModal';
import { toast } from '../../hooks/useToast';

interface CategoryDetailModalProps {
  category?: MaterialCategory | null;
  categories?: MaterialCategory[];
  onClose: () => void;
}

export default function CategoryDetailModal({
  category,
  categories: externalCategories,
  onClose,
}: CategoryDetailModalProps) {
  const isNew = !category;
  const [isReadOnly, setIsReadOnly] = useState(!isNew);

  // Yeni mod sekmesi: 'addCategory' veya 'addSubCategory'
  const [newModeTab, setNewModeTab] = useState<'addCategory' | 'addSubCategory'>('addCategory');

  // Kategori form state'leri
  const [categoryName, setCategoryName] = useState('');
  const [rentalUnit, setRentalUnit] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Alt kategori ekleme (yeni modda) state'leri
  const [allCategories, setAllCategories] = useState<MaterialCategory[]>(externalCategories || []);
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState<number | ''>('');
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [subCategoryBusy, setSubCategoryBusy] = useState(false);

  // Mevcut kategori modunda alt kategori state'leri
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [subCategoriesLoading, setSubCategoriesLoading] = useState(false);
  const [existingNewSubCategoryName, setExistingNewSubCategoryName] = useState('');
  const [editingSubCategory, setEditingSubCategory] = useState<SubCategory | null>(null);
  const [editSubCategoryName, setEditSubCategoryName] = useState('');

  // Yeni modda, alt kategori ekleme sekmesinde mevcut alt kategorileri goster
  const [parentSubCategories, setParentSubCategories] = useState<SubCategory[]>([]);
  const [parentSubCategoriesLoading, setParentSubCategoriesLoading] = useState(false);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [showDeleteSubCategoryConfirm, setShowDeleteSubCategoryConfirm] = useState(false);
  const [subCategoryToDelete, setSubCategoryToDelete] = useState<SubCategory | null>(null);

  useEffect(() => {
    if (category) {
      setCategoryName(category.CategoryName);
      setRentalUnit(category.RentalUnit || '');
      loadSubCategories(category.CategoryId);
    }
  }, [category]);

  // Yeni modda kategorileri yukle (eger disaridan gelmemisse)
  useEffect(() => {
    if (isNew && (!externalCategories || externalCategories.length === 0)) {
      loadCategories();
    }
  }, [isNew]);

  const loadCategories = async () => {
    try {
      const data = await inventoryService.getAllCategoriesAsync();
      setAllCategories(data);
    } catch (error) {
      console.error('Load categories error:', error);
    }
  };

  // Secili parent kategori degistiginde alt kategorilerini yukle
  useEffect(() => {
    if (isNew && selectedParentCategoryId) {
      loadParentSubCategories(Number(selectedParentCategoryId));
    } else {
      setParentSubCategories([]);
    }
  }, [selectedParentCategoryId, isNew]);

  const loadParentSubCategories = async (categoryId: number) => {
    try {
      setParentSubCategoriesLoading(true);
      const data = await subcategoryService.getAllAsync(categoryId);
      setParentSubCategories(data);
    } catch (error) {
      console.error('Load parent subcategories error:', error);
    } finally {
      setParentSubCategoriesLoading(false);
    }
  };

  const loadSubCategories = async (categoryId: number) => {
    try {
      setSubCategoriesLoading(true);
      const data = await subcategoryService.getAllAsync(categoryId);
      setSubCategories(data);
    } catch (error) {
      console.error('Load subcategories error:', error);
    } finally {
      setSubCategoriesLoading(false);
    }
  };

  // ---- Kategori kaydet (yeni veya guncelle) ----
  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      toast.warning('Kategori adı zorunludur');
      return;
    }

    try {
      setIsBusy(true);
      if (isNew) {
        await inventoryService.createCategoryAsync({
          CategoryName: categoryName,
          RentalUnit: rentalUnit || undefined,
        });
      } else if (category) {
        await inventoryService.updateCategoryAsync(category.CategoryId, {
          CategoryName: categoryName,
          RentalUnit: rentalUnit || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error('Save category error:', error);
      toast.error('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteCategoryClick = () => {
    if (!category) return;
    setShowDeleteCategoryConfirm(true);
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!category) return;
    try {
      setIsBusy(true);
      await inventoryService.deleteCategoryAsync(category.CategoryId);
      setShowDeleteCategoryConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete category error:', error);
      toast.error('Silme hatası. Kategoriye ait envanter varsa önce onları silin veya başka kategoriye taşıyın.');
    } finally {
      setIsBusy(false);
    }
  };

  // ---- Alt kategori ekleme (yeni modda - parent secili) ----
  const handleAddSubCategoryNew = async () => {
    if (!selectedParentCategoryId) {
      toast.warning('Lütfen bir kategori seçin');
      return;
    }
    if (!newSubCategoryName.trim()) {
      toast.warning('Alt kategori adı zorunludur');
      return;
    }

    try {
      setSubCategoryBusy(true);
      await subcategoryService.createAsync({
        CategoryId: Number(selectedParentCategoryId),
        SubCategoryName: newSubCategoryName.trim(),
      });
      setNewSubCategoryName('');
      loadParentSubCategories(Number(selectedParentCategoryId));
    } catch (error) {
      console.error('Add subcategory error:', error);
      toast.error('Alt kategori ekleme hatası');
    } finally {
      setSubCategoryBusy(false);
    }
  };

  // ---- Alt kategori ekleme (mevcut kategori modunda) ----
  const handleAddSubCategoryExisting = async () => {
    if (!category || !existingNewSubCategoryName.trim()) {
      toast.warning('Alt kategori adı zorunludur');
      return;
    }

    try {
      setSubCategoryBusy(true);
      await subcategoryService.createAsync({
        CategoryId: category.CategoryId,
        SubCategoryName: existingNewSubCategoryName.trim(),
      });
      setExistingNewSubCategoryName('');
      loadSubCategories(category.CategoryId);
    } catch (error) {
      console.error('Add subcategory error:', error);
      toast.error('Alt kategori ekleme hatası');
    } finally {
      setSubCategoryBusy(false);
    }
  };

  // ---- Alt kategori duzenleme ----
  const handleStartEditSubCategory = (sc: SubCategory) => {
    setEditingSubCategory(sc);
    setEditSubCategoryName(sc.SubCategoryName);
  };

  const handleSaveEditSubCategory = async () => {
    if (!editingSubCategory || !editSubCategoryName.trim()) {
      toast.warning('Alt kategori adı zorunludur');
      return;
    }

    try {
      setSubCategoryBusy(true);
      await subcategoryService.updateAsync(editingSubCategory.SubCategoryId, {
        SubCategoryName: editSubCategoryName.trim(),
      });
      setEditingSubCategory(null);
      setEditSubCategoryName('');
      // Hangi modda olduguna gore reload yap
      if (category) {
        loadSubCategories(category.CategoryId);
      } else if (selectedParentCategoryId) {
        loadParentSubCategories(Number(selectedParentCategoryId));
      }
    } catch (error) {
      console.error('Update subcategory error:', error);
      toast.error('Alt kategori güncelleme hatası');
    } finally {
      setSubCategoryBusy(false);
    }
  };

  // ---- Alt kategori silme ----
  const handleDeleteSubCategoryClick = (sc: SubCategory) => {
    setSubCategoryToDelete(sc);
    setShowDeleteSubCategoryConfirm(true);
  };

  const handleDeleteSubCategoryConfirm = async () => {
    if (!subCategoryToDelete) return;
    try {
      setSubCategoryBusy(true);
      await subcategoryService.deleteAsync(subCategoryToDelete.SubCategoryId);
      setShowDeleteSubCategoryConfirm(false);
      setSubCategoryToDelete(null);
      if (category) {
        loadSubCategories(category.CategoryId);
      } else if (selectedParentCategoryId) {
        loadParentSubCategories(Number(selectedParentCategoryId));
      }
    } catch (error) {
      console.error('Delete subcategory error:', error);
      toast.error('Alt kategori silme hatası');
    } finally {
      setSubCategoryBusy(false);
    }
  };

  // ---- Alt kategori listesi renderla (ortak) ----
  const renderSubCategoryList = (list: SubCategory[], loading: boolean) => {
    if (loading) {
      return <div className="text-center text-text-secondary py-4">Yükleniyor...</div>;
    }
    if (list.length === 0) {
      return (
        <div className="text-center py-4">
          <div className="text-text-secondary text-sm">Henüz alt kategori eklenmemiş</div>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {list.map((sc) => (
          <div
            key={sc.SubCategoryId}
            className="flex items-center gap-2 p-3 rounded-lg border border-background-border hover:bg-background-hover transition-colors"
          >
            {editingSubCategory?.SubCategoryId === sc.SubCategoryId ? (
              <>
                <input
                  type="text"
                  value={editSubCategoryName}
                  onChange={(e) => setEditSubCategoryName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSaveEditSubCategory()}
                  className="input flex-1"
                  autoFocus
                />
                <button
                  onClick={handleSaveEditSubCategory}
                  disabled={subCategoryBusy}
                  className="text-green-400 hover:text-green-300 text-sm font-medium px-2"
                >
                  Kaydet
                </button>
                <button
                  onClick={() => {
                    setEditingSubCategory(null);
                    setEditSubCategoryName('');
                  }}
                  className="text-text-secondary hover:text-text-primary text-sm px-2"
                >
                  Vazgeç
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-medium">{sc.SubCategoryName}</span>
                <button
                  onClick={() => handleStartEditSubCategory(sc)}
                  className="text-blue-400 hover:text-blue-300 text-sm px-2"
                >
                  Düzenle
                </button>
                <button
                  onClick={() => handleDeleteSubCategoryClick(sc)}
                  disabled={subCategoryBusy}
                  className="text-red-400 hover:text-red-300 text-sm px-2"
                >
                  Sil
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">

        {/* ===== YENİ MOD: Kategori Ekle + Alt Kategori Ekle sekmeleri ===== */}
        {isNew && (
          <>
            <h2 className="text-2xl font-bold mb-4">Kategori Yönetimi</h2>

            {/* Sekme navigasyonu */}
            <div className="flex gap-2 mb-6 border-b border-background-border">
              <button
                onClick={() => setNewModeTab('addCategory')}
                className={`px-4 py-2 font-medium transition-colors ${
                  newModeTab === 'addCategory'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Kategori Ekle
              </button>
              <button
                onClick={() => setNewModeTab('addSubCategory')}
                className={`px-4 py-2 font-medium transition-colors ${
                  newModeTab === 'addSubCategory'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Alt Kategori Ekle
              </button>
            </div>

            {/* Sekme 1: Yeni Kategori Ekle */}
            {newModeTab === 'addCategory' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Kategori Adı *</label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Örn: Cephe İskelesi"
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Kiralama Birimi</label>
                  <input
                    type="text"
                    value={rentalUnit}
                    onChange={(e) => setRentalUnit(e.target.value)}
                    placeholder="Örn: adet, metre, m²"
                    className="input w-full"
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={onClose} className="btn-secondary flex-1">
                    İptal
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    disabled={isBusy}
                    className="btn-primary flex-1"
                  >
                    {isBusy ? 'Kaydediliyor...' : 'Kategori Kaydet'}
                  </button>
                </div>
              </div>
            )}

            {/* Sekme 2: Alt Kategori Ekle */}
            {newModeTab === 'addSubCategory' && (
              <div className="space-y-4">
                {/* Kategori secimi */}
                <div>
                  <label className="block text-sm font-medium mb-2">Kategori Seçin *</label>
                  <select
                    value={selectedParentCategoryId}
                    onChange={(e) => setSelectedParentCategoryId(Number(e.target.value) || '')}
                    className="input w-full"
                  >
                    <option value="">Kategori seçin...</option>
                    {allCategories.map((cat) => (
                      <option key={cat.CategoryId} value={cat.CategoryId}>
                        {cat.CategoryName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Alt kategori ekleme formu */}
                {selectedParentCategoryId && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Yeni Alt Kategori Adı *</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSubCategoryName}
                          onChange={(e) => setNewSubCategoryName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddSubCategoryNew()}
                          placeholder="Alt kategori adı girin..."
                          className="input flex-1"
                        />
                        <button
                          onClick={handleAddSubCategoryNew}
                          disabled={subCategoryBusy || !newSubCategoryName.trim()}
                          className="btn-primary text-sm px-4"
                        >
                          {subCategoryBusy ? '...' : 'Ekle'}
                        </button>
                      </div>
                    </div>

                    {/* Mevcut alt kategoriler */}
                    <div className="border-t border-background-border pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-text-secondary">
                          Mevcut Alt Kategoriler
                        </h3>
                        <span className="text-xs text-text-secondary">
                          {parentSubCategories.length} adet
                        </span>
                      </div>
                      {renderSubCategoryList(parentSubCategories, parentSubCategoriesLoading)}
                    </div>
                  </>
                )}

                {!selectedParentCategoryId && (
                  <div className="text-center py-8 text-text-secondary">
                    Alt kategori eklemek için yukarıdan bir kategori seçin
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <button onClick={onClose} className="btn-secondary flex-1">
                    Kapat
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== MEVCUT KATEGORİ MODU: Detay + Alt Kategoriler ===== */}
        {!isNew && category && (
          <>
            <h2 className="text-2xl font-bold mb-6">Kategori Detayı</h2>

            {/* Kategori Bilgileri */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Kategori Adı *</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Örn: Cephe İskelesi"
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Kiralama Birimi</label>
                <input
                  type="text"
                  value={rentalUnit}
                  onChange={(e) => setRentalUnit(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Örn: adet, metre, m²"
                  className="input w-full"
                />
              </div>
            </div>

            {/* Alt Kategoriler */}
            <div className="mt-6 border-t border-background-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Alt Kategoriler</h3>
                <span className="text-sm text-text-secondary">
                  {subCategories.length} alt kategori
                </span>
              </div>

              {/* Yeni alt kategori ekleme */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={existingNewSubCategoryName}
                  onChange={(e) => setExistingNewSubCategoryName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSubCategoryExisting()}
                  placeholder="Yeni alt kategori adı..."
                  className="input flex-1"
                />
                <button
                  onClick={handleAddSubCategoryExisting}
                  disabled={subCategoryBusy || !existingNewSubCategoryName.trim()}
                  className="btn-primary text-sm px-4"
                >
                  Ekle
                </button>
              </div>

              {renderSubCategoryList(subCategories, subCategoriesLoading)}
            </div>

            {/* Butonlar */}
            <div className="flex gap-3 mt-6">
              {isReadOnly && (
                <>
                  <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
                    Düzenle
                  </button>
                  <button onClick={onClose} className="btn-secondary flex-1">
                    Kapat
                  </button>
                </>
              )}
              {!isReadOnly && (
                <>
                  <button
                    onClick={handleDeleteCategoryClick}
                    disabled={isBusy}
                    className="btn-danger flex-1"
                  >
                    Sil
                  </button>
                  <button onClick={onClose} className="btn-secondary flex-1">
                    İptal
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    disabled={isBusy}
                    className="btn-primary flex-1"
                  >
                    {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <ConfirmModal
        open={showDeleteCategoryConfirm}
        title="Onaylıyor musunuz?"
        message="Bu kategoriyi silmek istediğinizden emin misiniz? Kategoriye ait alt kategoriler de silinecektir."
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteCategoryConfirm}
        onCancel={() => setShowDeleteCategoryConfirm(false)}
      />
      <ConfirmModal
        open={showDeleteSubCategoryConfirm}
        title="Onaylıyor musunuz?"
        message={subCategoryToDelete ? `"${subCategoryToDelete.SubCategoryName}" alt kategorisini silmek istediğinizden emin misiniz?` : ''}
        variant="danger"
        loading={subCategoryBusy}
        onConfirm={handleDeleteSubCategoryConfirm}
        onCancel={() => { setShowDeleteSubCategoryConfirm(false); setSubCategoryToDelete(null); }}
      />
    </div>
  );
}
