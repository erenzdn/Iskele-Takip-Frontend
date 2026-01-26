import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async createRequest(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<Request> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const request = new Request(url, config);

    // Log request
    console.log(`[API REQUEST] ${method} ${url}`);
    if (body) {
      console.log('[API REQUEST BODY]', body);
      console.log('[API REQUEST BODY JSON]', JSON.stringify(body));
    }

    return request;
  }

  async sendAsync<T>(request: Request): Promise<T> {
    try {
      const response = await fetch(request);
      
      // Log response
      console.log(`[API RESPONSE] ${response.status} for ${request.url}`);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.log('[API ERROR RESPONSE]', errorText);
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
      console.log('[API RESPONSE BODY]', text);
      
      if (!text) {
        throw new Error('Boş yanıt alındı');
      }
      
      let data: T;
      try {
        data = JSON.parse(text) as T;
        console.log('[API PARSED DATA]', data);
      } catch (parseError) {
        console.error('[API PARSE ERROR]', parseError, 'Raw text:', text);
        throw new Error('API yanıtı parse edilemedi');
      }
      
      return data;
    } catch (error) {
      console.error('[API ERROR]', error);
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

  async delete<T>(endpoint: string): Promise<T> {
    const request = await this.createRequest('DELETE', endpoint);
    return this.sendAsync<T>(request);
  }

  async getBlob(endpoint: string): Promise<Blob> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = useAuthStore.getState().token;

    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    console.log(`[API REQUEST] GET ${url} (blob)`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      console.log(`[API RESPONSE] ${response.status} for ${url} (blob)`);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.log('[API ERROR RESPONSE]', errorText);
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
      console.error('[API ERROR]', error);
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

    const config: RequestInit = {
      method: 'POST',
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    console.log(`[API REQUEST] POST ${url} (blob)`);
    if (body) {
      console.log('[API REQUEST BODY]', body);
    }

    try {
      const response = await fetch(url, config);

      console.log(`[API RESPONSE] ${response.status} for ${url} (blob)`);

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.log('[API ERROR RESPONSE]', errorText);
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
      console.error('[API ERROR]', error);
      throw error;
    }
  }
}

export const apiClient = new ApiClient();

