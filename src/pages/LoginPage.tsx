import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';
import { getUserFacingErrorMessage } from '../utils/apiError';
import { firstValidationError, normalizeText, validateRequired } from '../utils/validation';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsBusy(true);

    // Validation
    const validationError = firstValidationError([
      validateRequired(username, 'Kullanıcı adı'),
      validateRequired(password, 'Şifre'),
    ]);
    if (validationError) {
      setErrorMessage(validationError);
      setIsBusy(false);
      return;
    }

    try {
      console.log('[LOGIN] Giriş denemesi:', { username, password: '***' });
      const response = await authService.loginAsync({ 
        username: normalizeText(username),
        password: normalizeText(password)
      });
      console.log('[LOGIN] Başarılı, response:', response);

      if (!response?.accessToken) {
        throw new Error('Geçersiz yanıt: accessToken alınamadı');
      }
      if (!response.user || !Array.isArray(response.user.permissions)) {
        throw new Error('Geçersiz yanıt: kullanıcı veya permissions alınamadı');
      }

      login(response.accessToken, response.user);
      navigate('/');
    } catch (error: any) {
      console.error('[LOGIN] Hata detayları:', error);
      
      let errorMsg = 'Giriş başarısız. Lütfen kullanıcı adı ve şifrenizi kontrol edin.';
      
      if (error?.message) {
        if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('Geçersiz kimlik bilgisi')) {
          errorMsg = 'Kullanıcı adı veya şifre hatalı. Lütfen backend\'inizdeki kullanıcı bilgilerini ve şifre hash\'leme durumunu kontrol edin.';
        } else if (error.message.includes('404')) {
          errorMsg = 'API endpoint bulunamadı. Backend\'in çalıştığından emin olun.';
        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMsg = `Backend API'ye bağlanılamıyor. Backend'in ${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'} adresinde çalıştığından emin olun.`;
        } else {
          errorMsg = error.message;
        }
      }
      
      errorMsg = getUserFacingErrorMessage(error, errorMsg);
      
      setErrorMessage(errorMsg);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-main">
      <div className="card w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">İskeleTakip</h1>
          <p className="text-text-secondary">Masaüstü Uygulaması</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Kullanıcı Adı
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input w-full"
              placeholder="Kullanıcı adınızı girin"
              required
              disabled={isBusy}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="Şifrenizi girin"
              required
              disabled={isBusy}
            />
          </div>

          {errorMessage && (
            <div className="text-error text-sm">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className={`btn-primary w-full ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isBusy ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}

