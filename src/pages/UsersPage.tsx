import { useState, useEffect } from 'react';
import { UserIcon } from '@phosphor-icons/react';
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
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        <button onClick={loadUsers} className="btn-secondary py-2 px-3 text-sm">Yenile</button>
        <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">+ Yeni Kullanıcı</button>
      </div>

      <div className="mb-2 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Kullanıcı adı, ad soyad veya e-posta..."
          className="input flex-1 min-w-[200px] py-2 px-3 text-sm"
        />
        <button onClick={handleSearch} className="btn-secondary py-2 px-3 text-sm">Ara</button>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<UserIcon size={48} weight="duotone" />}
          title="Henüz kullanıcı bulunmuyor"
          description="Yeni kullanıcı eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-160px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kullanıcı Adı</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ad Soyad</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">E-posta</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">İzin</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Son Giriş</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Tarihi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, index) => (
                  <tr
                    key={user.UserId}
                    className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                    onClick={() => handleOpenDetail(user)}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 font-medium text-text-primary">{user.Username}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{user.FullName}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 opacity-90">{user.Email || '-'}</td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">{user.Permissions?.length || 0}</td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${user.IsActive ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>{user.IsActive ? 'Aktif' : 'Pasif'}</span>
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">{formatDate(user.LastLoginAt)}</td>
                    <td className="py-0.5 px-2 align-middle text-text-secondary">{formatShortDateTime(user.CreatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {users.length} kullanıcı</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
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
