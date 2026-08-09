const BASE = '/api';

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  // Public
  getFormStatus(id: string, deviceId: string, token: string) {
    const params = new URLSearchParams({ deviceId, t: token });
    return request(`/f/${id}?${params}`);
  },
  submitForm(id: string, body: any) {
    return request(`/f/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Auth
  getMe() {
    return request('/auth/me');
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },

  // Admin: Form Instances
  listFormInstances() {
    return request('/admin/form-instances');
  },
  getFormInstance(id: string) {
    return request(`/admin/form-instances/${id}`);
  },
  createFormInstance(body: any) {
    return request('/admin/form-instances', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  updateFormInstance(id: string, body: any) {
    return request(`/admin/form-instances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },
  deleteFormInstance(id: string) {
    return request(`/admin/form-instances/${id}`, { method: 'DELETE' });
  },
  generateQr(id: string, validityDays: number) {
    return request(`/admin/form-instances/${id}/generate-qr`, {
      method: 'POST',
      body: JSON.stringify({ validityDays }),
    });
  },
  getQrPngUrl(id: string) {
    return `${BASE}/admin/form-instances/${id}/qr.png`;
  },

  // Admin: Submissions
  listSubmissions(params?: Record<string, string>) {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/admin/submissions${qs}`);
  },
  toggleDuplicate(id: string) {
    return request(`/admin/submissions/${id}/toggle-duplicate`, { method: 'POST' });
  },

  // Admin: Bitable
  getBitableStatus() {
    return request('/admin/bitable-status');
  },
  bootstrapBitable() {
    return request('/admin/bootstrap-bitable', { method: 'POST' });
  },
  setBitableConfig(appToken: string, recordsTableId: string, qrcodesTableId?: string) {
    return request('/admin/set-bitable-config', {
      method: 'POST',
      body: JSON.stringify({ appToken, recordsTableId, qrcodesTableId }),
    });
  },
  retrySync() {
    return request('/admin/retry-sync', { method: 'POST' });
  },
  listBitableTables(appToken?: string) {
    const qs = appToken ? `?appToken=${encodeURIComponent(appToken)}` : '';
    return request(`/admin/bitable-tables${qs}`);
  },
  listAdmins() {
    return request('/admin/admins');
  },
  toggleAdminActive(id: string) {
    return request(`/admin/admins/${id}/toggle-active`, { method: 'POST' });
  },
};