// Tiny fetch wrapper: keeps the short-lived access token in memory only (never localStorage),
// and transparently refreshes it through the httpOnly refresh cookie.
let accessToken = null;
let refreshing = null;
let onAuthLost = () => {};

export const setAuthLostHandler = (fn) => {
  onAuthLost = fn;
};
export const setToken = (t) => {
  accessToken = t;
};

export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }
  get details() {
    return this.errors.length ? this.errors.map((e) => `${e.field ? e.field + ': ' : ''}${e.message}`).join('\n') : this.message;
  }
}

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { res, data };
}

function refresh() {
  if (!refreshing) {
    refreshing = raw('/auth/refresh', { method: 'POST', auth: false })
      .then(({ res, data }) => {
        if (!res.ok) throw new ApiError(res.status, data?.message || 'Session expired');
        accessToken = data.accessToken;
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh'];

async function request(path, opts = {}) {
  let { res, data } = await raw(path, opts);
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    try {
      await refresh();
      ({ res, data } = await raw(path, opts));
    } catch {
      accessToken = null;
      onAuthLost();
      throw new ApiError(401, 'Session expired — please sign in again');
    }
  }
  if (!res.ok) throw new ApiError(res.status, data?.message || 'Request failed', data?.errors);
  return data;
}

export async function restoreSession() {
  try {
    const d = await refresh();
    return d.user;
  } catch {
    return null;
  }
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: body ?? {} }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),
};
