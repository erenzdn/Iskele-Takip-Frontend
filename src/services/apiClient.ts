import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const SIGNING_SECRET = import.meta.env.VITE_SIGNING_SECRET;
const SIGNING_ENABLED = import.meta.env.VITE_SIGNING_ENABLED === 'true';

/** Sadece development'ta loglar; production'da API istek/yanıt detayları görünmez. */
const isDev = import.meta.env.DEV;
function devLog(...args: unknown[]) {
  if (isDev) console.log(...args);
}

/** Content-Disposition başlığından indirme dosya adını çıkarır */
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8 = /filename\*=(?:UTF-8'')?([^;\n]+)/i.exec(header);
  if (utf8) {
    const raw = utf8[1].trim().replace(/^["']|["']$/g, '');
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted) return quoted[1].trim();
  const plain = /filename=([^;\n]+)/i.exec(header);
  if (plain) return plain[1].trim().replace(/^["']|["']$/g, '');
  return null;
}

// Signing aktifse secret zorunlu
if (SIGNING_ENABLED && !SIGNING_SECRET) {
  throw new Error(
    'VITE_SIGNING_SECRET environment variable tanımlanmamış. ' +
    'Request signing aktifken bu değer zorunludur. ' +
    'Lütfen .env dosyanızda VITE_SIGNING_SECRET değerini tanımlayın.'
  );
}

interface SignatureResult {
  signature: string;
  timestamp: string;
  nonce: string;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

interface RequestMetricEntry {
  count: number;
  timestamps: number[];
}

class RequestMetricsCollector {
  private entries = new Map<string, RequestMetricEntry>();
  private readonly maxSamplesPerEndpoint = 2000;

  record(method: string, endpoint: string) {
    const key = `${method.toUpperCase()} ${this.normalizeEndpoint(endpoint)}`;
    const now = Date.now();
    const current = this.entries.get(key) ?? { count: 0, timestamps: [] };
    current.count += 1;
    current.timestamps.push(now);
    if (current.timestamps.length > this.maxSamplesPerEndpoint) {
      current.timestamps.splice(0, current.timestamps.length - this.maxSamplesPerEndpoint);
    }
    this.entries.set(key, current);
  }

  snapshot() {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const endpoints = Array.from(this.entries.entries()).map(([key, entry]) => ({
      endpoint: key,
      total: entry.count,
      perMinute: entry.timestamps.filter((t) => t >= oneMinuteAgo).length,
    }));
    endpoints.sort((a, b) => b.total - a.total);
    return {
      generatedAt: new Date(now).toISOString(),
      totalRequests: endpoints.reduce((sum, item) => sum + item.total, 0),
      requestsLastMinute: endpoints.reduce((sum, item) => sum + item.perMinute, 0),
      endpoints,
    };
  }

  reset() {
    this.entries.clear();
  }

  private normalizeEndpoint(endpoint: string): string {
    return endpoint
      .replace(/\d+/g, ':id')
      .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}/g, ':uuid');
  }
}

class ApiClient {
  private baseUrl: string;
  private signingSecret: string;
  private signingEnabled: boolean;
  private readonly excludedEndpoints = ['/health', '/auth/login'];
  private readonly metrics = new RequestMetricsCollector();

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
    this.signingSecret = SIGNING_SECRET || '';
    this.signingEnabled = SIGNING_ENABLED;
  }

  /**
   * Endpoint'in imza gerektirip gerektirmediğini kontrol eder
   */
  private isExcludedEndpoint(endpoint: string): boolean {
    return this.excludedEndpoints.some(e => endpoint.startsWith(e));
  }

  /**
   * HMAC-SHA256 ile request imzası oluşturur (Web Crypto API)
   * @param method HTTP method (GET, POST, vb.)
   * @param path İstek path'i (örn: /customers)
   * @param body İstek body'si
   * @returns signature, timestamp, nonce
   */
  private async createSignature(
    method: string,
    path: string,
    body?: unknown
  ): Promise<SignatureResult> {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    // Body hash hesapla (Web Crypto API)
    const bodyString = body && Object.keys(body as object).length > 0
      ? JSON.stringify(body)
      : '';
    const bodyBuffer = new TextEncoder().encode(bodyString);
    const bodyHashBuffer = await crypto.subtle.digest('SHA-256', bodyBuffer);
    const bodyHash = Array.from(new Uint8Array(bodyHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Signature payload oluştur
    const signaturePayload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${bodyHash}`;

    // HMAC-SHA256 imza (Web Crypto API)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.signingSecret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signaturePayload)
    );

    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return { signature, timestamp, nonce };
  }

  /**
   * Header'lara imza bilgilerini ekler
   */
  private async addSignatureHeaders(
    headers: HeadersInit,
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<void> {
    if (!this.signingEnabled || this.isExcludedEndpoint(endpoint)) {
      return;
    }

    const { signature, timestamp, nonce } = await this.createSignature(
      method,
      endpoint,
      body
    );

    (headers as Record<string, string>)['X-Timestamp'] = timestamp;
    (headers as Record<string, string>)['X-Nonce'] = nonce;
    (headers as Record<string, string>)['X-Signature'] = signature;

    devLog(`[API SIGNING] Endpoint: ${endpoint}, Timestamp: ${timestamp}, Nonce: ${nonce}`);
  }

  private async createRequest(
    method: HttpMethod,
    endpoint: string,
    body?: unknown
  ): Promise<Request> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Body olmayan GET/DELETE isteklerinde Content-Type göndermeyerek gereksiz preflight tetiklerini azaltır.
    if (body != null) {
      headers['Content-Type'] = 'application/json';
    }

    // Request signing header'larını ekle
    await this.addSignatureHeaders(headers, method, endpoint, body);

    const config: RequestInit = {
      method,
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const request = new Request(url, config);

    devLog(`[API REQUEST] ${method} ${url}`);
    if (body) devLog('[API REQUEST BODY]', body);

    return request;
  }

  async sendAsync<T>(request: Request): Promise<T> {
    try {
      this.metrics.record(request.method, new URL(request.url).pathname);
      const response = await fetch(request);
      
      devLog(`[API RESPONSE] ${response.status} for ${request.url}`);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          devLog('[API ERROR RESPONSE]', errorText);
        } catch {
          errorText = 'Yanıt okunamadı';
        }
        const error = new Error(`API Error: ${response.status} - ${errorText}`);
        (error as any).status = response.status;
        (error as any).responseText = errorText;
        throw error;
      }

      // Handle empty responses (204 No Content)
      if (response.status === 204) {
        return null as T;
      }

      const text = await response.text();
      devLog('[API RESPONSE BODY]', text);

      if (!text) {
        throw new Error('Boş yanıt alındı');
      }

      let data: T;
      try {
        data = JSON.parse(text) as T;
        devLog('[API PARSED DATA]', data);
      } catch (parseError) {
        if (isDev) console.error('[API PARSE ERROR]', parseError, 'Raw text:', text);
        throw new Error('API yanıtı parse edilemedi');
      }
      
      return data;
    } catch (error) {
      devLog('[API ERROR]', error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    const request = await this.createRequest('GET', endpoint);
    return this.sendAsync<T>(request);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const request = await this.createRequest('POST', endpoint, body);
    return this.sendAsync<T>(request);
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    const request = await this.createRequest('PATCH', endpoint, body);
    return this.sendAsync<T>(request);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    const request = await this.createRequest('PUT', endpoint, body);
    return this.sendAsync<T>(request);
  }

  async delete<T>(endpoint: string): Promise<T> {
    const request = await this.createRequest('DELETE', endpoint);
    return this.sendAsync<T>(request);
  }

  getRequestMetricsSnapshot() {
    return this.metrics.snapshot();
  }

  resetRequestMetrics() {
    this.metrics.reset();
  }

  async getBlob(endpoint: string): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Request signing header'larını ekle
    await this.addSignatureHeaders(headers, 'GET', endpoint);

    devLog(`[API REQUEST] GET ${url} (blob)`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      devLog(`[API RESPONSE] ${response.status} for ${url} (blob)`);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          devLog('[API ERROR RESPONSE]', errorText);
        } catch {
          errorText = 'Yanıt okunamadı';
        }
        const error = new Error(`API Error: ${response.status} - ${errorText}`);
        (error as any).status = response.status;
        (error as any).responseText = errorText;
        throw error;
      }

      const blob = await response.blob();
      return blob;
    } catch (error) {
      devLog('[API ERROR]', error);
      throw error;
    }
  }

  /**
   * GET ile blob indirir; Content-Disposition içindeki dosya adını döner.
   */
  async getBlobDownload(endpoint: string): Promise<{ blob: Blob; filename: string | null }> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    await this.addSignatureHeaders(headers, 'GET', endpoint);

    devLog(`[API REQUEST] GET ${url} (blob download)`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      devLog(`[API RESPONSE] ${response.status} for ${url} (blob download)`);

      const filename = filenameFromContentDisposition(response.headers.get('Content-Disposition'));

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          devLog('[API ERROR RESPONSE]', errorText);
        } catch {
          errorText = 'Yanıt okunamadı';
        }
        const error = new Error(`API Error: ${response.status} - ${errorText}`);
        (error as any).status = response.status;
        (error as any).responseText = errorText;
        throw error;
      }

      const blob = await response.blob();
      return { blob, filename };
    } catch (error) {
      devLog('[API ERROR]', error);
      throw error;
    }
  }

  /**
   * multipart/form-data POST (FormData). Content-Type set edilmez (boundary için).
   * İmza: body hash boş (JSON body yok).
   * Excel import gibi JSON dönen uçlar için: success:false gövdesi HTTP 400 olsa bile parse edilip döndürülür.
   */
  async postFormData<T = unknown>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    await this.addSignatureHeaders(headers, 'POST', endpoint, undefined);

    devLog(`[API REQUEST] POST ${url} (multipart)`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      devLog(`[API RESPONSE] ${response.status} for ${url} (multipart)`);

      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          if (!response.ok) {
            const error = new Error(text || `API Error: ${response.status}`);
            (error as any).status = response.status;
            (error as any).responseText = text;
            throw error;
          }
          throw new Error('API yanıtı parse edilemedi');
        }
      }

      if (!response.ok) {
        const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
        if (obj && obj.success === false) {
          return parsed as T;
        }
        let userMessage = '';
        if (obj) {
          userMessage =
            (typeof obj.message === 'string' && obj.message) ||
            (typeof obj.error === 'string' && obj.error) ||
            '';
        }
        const errorText = userMessage || text || `API Error: ${response.status}`;
        const error = new Error(errorText);
        (error as any).status = response.status;
        (error as any).responseText = text;
        throw error;
      }

      if (parsed === null && !text) {
        throw new Error('Boş yanıt alındı');
      }

      return parsed as T;
    } catch (error) {
      devLog('[API ERROR]', error);
      throw error;
    }
  }

  async postBlob(endpoint: string, body?: unknown): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Request signing header'larını ekle
    await this.addSignatureHeaders(headers, 'POST', endpoint, body);

    const config: RequestInit = {
      method: 'POST',
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    devLog(`[API REQUEST] POST ${url} (blob)`);
    if (body) devLog('[API REQUEST BODY]', body);

    try {
      const response = await fetch(url, config);

      devLog(`[API RESPONSE] ${response.status} for ${url} (blob)`);

      if (!response.ok) {
        let errorText = '';
        let userMessage = '';
        try {
          errorText = await response.text();
          devLog('[API ERROR RESPONSE]', errorText);

          // Backend JSON hata gövdesi döndürdüyse anlamlı mesajı ayıkla
          try {
            const parsed = JSON.parse(errorText);
            if (parsed && typeof parsed === 'object') {
              userMessage =
                (parsed.message as string) ||
                (parsed.error as string) ||
                (parsed.title as string) ||
                '';
            }
          } catch {
            // plain text ise olduğu gibi bırak
          }
        } catch {
          errorText = 'Yanıt okunamadı';
        }

        const finalMessage = userMessage || errorText;
        const error = new Error(finalMessage || `API Error: ${response.status}`);
        (error as any).status = response.status;
        (error as any).responseText = finalMessage;
        (error as any).rawBody = errorText;
        throw error;
      }

      const contentType = response.headers.get('Content-Type') || '';
      const contentLength = response.headers.get('Content-Length') || '';
      devLog('[API BLOB] Content-Type:', contentType, 'Content-Length:', contentLength);

      const blob = await response.blob();
      return blob;
    } catch (error) {
      devLog('[API ERROR]', error);
      throw error;
    }
  }
}

export const apiClient = new ApiClient();
