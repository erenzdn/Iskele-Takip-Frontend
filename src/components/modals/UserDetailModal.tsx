import { useState, useEffect } from 'react';
import { User, PermissionCategory } from '../../models';
import { userService } from '../../services/userService';
import { permissionService } from '../../services/permissionService';
import { useAuthStore } from '../../store/authStore';
import ConfirmModal from './ConfirmModal';

interface UserDetailModalProps {
  user: User | null;
  isNew: boolean;
  onClose: () => void;
}

export default function UserDetailModal({
  user,
  isNew,
  onClose,
}: UserDetailModalProps) {
  const currentUser = useAuthStore((state) => state.user);
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissionCategories, setPermissionCategories] = useState<PermissionCategory[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    loadPermissions();
    if (user) {
      setUsername(user.Username);
      setFullName(user.FullName);
      setEmail(user.Email || '');
      setIsActive(user.IsActive);
      setSelectedPermissions(user.Permissions || []);
    }
  }, [user]);

  const loadPermissions = async () => {
    try {
      setPermissionsLoading(true);
      setPermissionsError(null);
      const data = await permissionService.getAllAsync();
      console.log('Permissions API response:', data);
      
      // API yanıtı direkt dizi olabilir veya { categories: [...] } formatında olabilir
      if (Array.isArray(data)) {
        setPermissionCategories(data);
      } else if (data && data.categories) {
        setPermissionCategories(data.categories);
      } else {
        console.error('Unexpected permissions format:', data);
        setPermissionsError('İzin formatı beklenenden farklı');
      }
    } catch (error) {
      console.error('Load permissions error:', error);
      setPermissionsError('İzinler yüklenirken hata oluştu');
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handlePermissionToggle = (permissionKey: string) => {
    if (isReadOnly) return;
    
    setSelectedPermissions((prev) => {
      if (prev.includes(permissionKey)) {
        return prev.filter((p) => p !== permissionKey);
      } else {
        return [...prev, permissionKey];
      }
    });
  };

  const handleCategoryToggle = (category: PermissionCategory) => {
    if (isReadOnly) return;
    
    const categoryPermissionKeys = category.permissions.map((p) => p.key);
    const allSelected = categoryPermissionKeys.every((key) =>
      selectedPermissions.includes(key)
    );

    if (allSelected) {
      // Tümünü kaldır
      setSelectedPermissions((prev) =>
        prev.filter((p) => !categoryPermissionKeys.includes(p))
      );
    } else {
      // Tümünü ekle
      setSelectedPermissions((prev) => {
        const newPermissions = [...prev];
        categoryPermissionKeys.forEach((key) => {
          if (!newPermissions.includes(key)) {
            newPermissions.push(key);
          }
        });
        return newPermissions;
      });
    }
  };

  const isCategoryFullySelected = (category: PermissionCategory) => {
    return category.permissions.every((p) => selectedPermissions.includes(p.key));
  };

  const isCategoryPartiallySelected = (category: PermissionCategory) => {
    const hasAny = category.permissions.some((p) =>
      selectedPermissions.includes(p.key)
    );
    const hasAll = isCategoryFullySelected(category);
    return hasAny && !hasAll;
  };

  const handleSelectAll = () => {
    if (isReadOnly) return;
    
    const allPermissionKeys = permissionCategories.flatMap((cat) =>
      cat.permissions.map((p) => p.key)
    );
    setSelectedPermissions(allPermissionKeys);
  };

  const handleDeselectAll = () => {
    if (isReadOnly) return;
    setSelectedPermissions([]);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      alert('Kullanıcı adı zorunludur');
      return;
    }

    if (!fullName.trim()) {
      alert('Ad soyad zorunludur');
      return;
    }

    if (isNew && !password.trim()) {
      alert('Yeni kullanıcı için şifre zorunludur');
      return;
    }

    try {
      setIsBusy(true);
      if (isNew) {
        await userService.createAsync({
          Username: username,
          Password: password,
          FullName: fullName,
          Email: email || undefined,
          IsActive: isActive,
          Permissions: selectedPermissions,
        });
      } else if (user) {
        await userService.updateAsync(user.UserId, {
          Password: password || undefined,
          FullName: fullName,
          Email: email || undefined,
          IsActive: isActive,
          Permissions: selectedPermissions,
        });
      }
      onClose();
    } catch (error) {
      console.error('Save user error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!user) return;
    if (currentUser && currentUser.UserId === user.UserId) {
      alert('Kendi hesabınızı silemezsiniz');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!user) return;
    try {
      setIsBusy(true);
      await userService.deleteAsync(user.UserId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete user error:', error);
      alert('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isNew ? 'Yeni Kullanıcı' : 'Kullanıcı Detayı'}
        </h2>

        {/* Kullanıcı Bilgi Kartı - Sadece mevcut kullanıcılarda göster */}
        {isReadOnly && !isNew && user && (
          <div className="mb-6 card bg-blue-900 p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Kullanıcı ID</div>
                <div className="text-xl font-bold">#{user.UserId}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Kayıt Tarihi</div>
                <div className="text-lg font-bold">{formatDate(user.CreatedAt)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Son Giriş</div>
                <div className="text-lg font-bold">{formatDate(user.LastLoginAt)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Sol Kolon - Kullanıcı Bilgileri */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Kullanıcı Adı *</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isReadOnly || (!isNew && user !== null)}
                placeholder="Giriş için kullanılacak kullanıcı adı"
                className="input w-full"
                required
              />
              {!isNew && (
                <p className="text-xs text-text-secondary mt-1">
                  Kullanıcı adı değiştirilemez
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Şifre {isNew ? '*' : '(Boş bırakılırsa değişmez)'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isReadOnly}
                placeholder={isNew ? 'Şifre girin' : 'Yeni şifre (opsiyonel)'}
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Ad Soyad *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isReadOnly}
                placeholder="Kullanıcının tam adı"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">E-posta Adresi</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isReadOnly}
                placeholder="ornek@email.com"
                className="input w-full"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="block text-sm font-medium">Durum</label>
              <button
                type="button"
                onClick={() => !isReadOnly && setIsActive(!isActive)}
                disabled={isReadOnly}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isActive ? 'bg-green-600' : 'bg-gray-600'
                } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={isActive ? 'text-green-500' : 'text-red-500'}>
                {isActive ? 'Aktif' : 'Pasif'}
              </span>
            </div>
          </div>

          {/* Sağ Kolon - İzinler */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium">İzinler</label>
              {!isReadOnly && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Tümünü Seç
                  </button>
                  <span className="text-text-secondary">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Tümünü Kaldır
                  </button>
                </div>
              )}
            </div>

            {permissionsLoading ? (
              <div className="text-text-secondary">İzinler yükleniyor...</div>
            ) : permissionsError ? (
              <div className="text-red-400 p-3 border border-red-600 rounded-lg">
                {permissionsError}
                <button
                  type="button"
                  onClick={loadPermissions}
                  className="ml-2 text-blue-400 hover:text-blue-300 underline"
                >
                  Tekrar Dene
                </button>
              </div>
            ) : permissionCategories.length === 0 ? (
              <div className="text-text-secondary p-3 border border-background-border rounded-lg">
                Henüz izin tanımı bulunamadı
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {permissionCategories.map((category) => (
                  <div
                    key={category.key}
                    className="border border-background-border rounded-lg p-3"
                  >
                    {/* Kategori Başlığı */}
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={isCategoryFullySelected(category)}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = isCategoryPartiallySelected(category);
                          }
                        }}
                        onChange={() => handleCategoryToggle(category)}
                        disabled={isReadOnly}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                      />
                      <span className="font-medium text-sm">
                        {category.displayName}
                      </span>
                    </div>

                    {/* İzin Checkboxları */}
                    <div className="grid grid-cols-2 gap-2 ml-6">
                      {category.permissions.map((permission) => (
                        <label
                          key={permission.key}
                          className={`flex items-center gap-2 text-sm ${
                            isReadOnly ? 'cursor-default' : 'cursor-pointer'
                          }`}
                          title={permission.description}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(permission.key)}
                            onChange={() => handlePermissionToggle(permission.key)}
                            disabled={isReadOnly}
                            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                          />
                          <span className="text-text-secondary">
                            {permission.displayName}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Seçili İzin Sayısı */}
            <div className="mt-3 text-sm text-text-secondary">
              Seçili izin sayısı:{' '}
              <span className="font-medium text-white">
                {selectedPermissions.length}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {!isNew && isReadOnly && (
            <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
              Düzenle
            </button>
          )}
          {!isReadOnly && (
            <>
              {!isNew && user && (
                <button
                  onClick={handleDeleteClick}
                  disabled={isBusy}
                  className="btn-danger flex-1"
                >
                  Sil
                </button>
              )}
              <button onClick={onClose} className="btn-secondary flex-1">
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={isBusy}
                className="btn-primary flex-1"
              >
                {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          )}
          {isReadOnly && !isNew && (
            <button onClick={onClose} className="btn-secondary flex-1">
              Kapat
            </button>
          )}
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu kullanıcıyı silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
