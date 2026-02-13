import { useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { User } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import UserDetailModal from '../components/modals/UserDetailModal';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await userService.getAllAsync();
      setUsers(data);
    } catch (error) {
      console.error('Load users error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim()) {
      loadUsers();
      return;
    }

    try {
      setLoading(true);
      const data = await userService.searchAsync(searchText);
      setUsers(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedUser(null);
    setIsNewUser(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (user: User) => {
    setSelectedUser(user);
    setIsNewUser(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    loadUsers();
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

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Kullanıcılar</h1>
          <p className="text-text-secondary">Sistem kullanıcılarını yönetin</p>
        </div>
        <button onClick={handleAddNew} className="btn-primary">
          + Yeni Kullanıcı
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Kullanıcı adı, ad soyad veya e-posta ile ara..."
          className="input flex-1"
        />
        <button onClick={handleSearch} className="btn-secondary">
          Ara
        </button>
        <button onClick={loadUsers} className="btn-secondary">
          Yenile
        </button>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon="👤"
          title="Henüz kullanıcı bulunmuyor"
          description="Yeni kullanıcı eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '15%' }}>
                    Kullanıcı Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '20%' }}>
                    Ad Soyad
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '20%' }}>
                    E-posta
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '15%' }}>
                    İzin Sayısı
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '10%' }}>
                    Durum
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '15%' }}>
                    Son Giriş
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '15%' }}>
                    Kayıt Tarihi
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.UserId}
                    className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                    onClick={() => handleOpenDetail(user)}
                  >
                    <td className="p-4">
                      <div className="font-medium">{user.Username}</div>
                    </td>
                    <td className="p-4">{user.FullName}</td>
                    <td className="p-4 opacity-80">{user.Email || '-'}</td>
                    <td className="p-4 text-center">
                      <span className="badge bg-blue-600 text-white">
                        {user.Permissions?.length || 0} izin
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`badge ${
                          user.IsActive
                            ? 'bg-green-600 text-white'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {user.IsActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-secondary">
                      {formatDate(user.LastLoginAt)}
                    </td>
                    <td className="p-4 text-sm text-text-secondary">
                      {formatShortDateTime(user.CreatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <UserDetailModal
          user={selectedUser}
          isNew={isNewUser}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
