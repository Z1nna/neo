/**
 * Shared API client for all microservices
 * Handles authentication, request formatting, and error handling
 */

const API_GATEWAY_URL = '/api/v1';

export class ApiClient {
  constructor(baseUrl = API_GATEWAY_URL) {
    this.baseUrl = baseUrl;
    this.userId = localStorage.getItem('userId') || 'user-123';
    this.moderatorToken = localStorage.getItem('moderatorToken') || null;
  }

  setUserId(userId) {
    this.userId = userId;
    localStorage.setItem('userId', userId);
  }

  setModeratorToken(token) {
    this.moderatorToken = token;
    localStorage.setItem('moderatorToken', token);
  }

  async request(method, endpoint, body = null, headers = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'X-User-ID': this.userId,
    };

    if (this.moderatorToken) {
      defaultHeaders['Authorization'] = `Bearer ${this.moderatorToken}`;
    }

    const config = {
      method,
      headers: { ...defaultHeaders, ...headers },
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = new Error(`API Error: ${response.status}`);
        error.status = response.status;
        error.url = url;
        console.error(`[${method}] ${url} - ${response.status}`);
        throw error;
      }

      const data = await response.json();
      console.log(`[${method}] ${url} - Success`);
      return { success: true, data, status: response.status };
    } catch (error) {
      console.error(`Request failed: ${error.message}`);
      return { success: false, error: error.message, status: error.status };
    }
  }

  get(endpoint) {
    return this.request('GET', endpoint);
  }

  post(endpoint, body) {
    return this.request('POST', endpoint, body);
  }

  put(endpoint, body) {
    return this.request('PUT', endpoint, body);
  }

  patch(endpoint, body) {
    return this.request('PATCH', endpoint, body);
  }

  delete(endpoint) {
    return this.request('DELETE', endpoint);
  }
}

export default new ApiClient();
