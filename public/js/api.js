/* ============================================================
   API CLIENT - Supabase first, Express fallback
   ============================================================ */

const API_BASE = window.location.protocol.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:5000/api';

const SUPABASE = window.SUPABASE_CONFIG || {};

function hasSupabaseConfig() {
  return Boolean(
    SUPABASE.url &&
    SUPABASE.anonKey &&
    !SUPABASE.url.includes('YOUR_PROJECT') &&
    !SUPABASE.anonKey.includes('YOUR_ANON_KEY')
  );
}

function supabaseHeaders(token) {
  return {
    apikey: SUPABASE.anonKey,
    Authorization: `Bearer ${token || SUPABASE.anonKey}`,
    'Content-Type': 'application/json',
  };
}

async function parseResponse(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.msg || body?.message || body?.error_description || body?.error || response.statusText;
    throw new Error(message);
  }
  return body;
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE.url}${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(options.token),
      ...(options.headers || {}),
    },
  });
  return parseResponse(response);
}

function normalizeProfile(profile, authUser) {
  return {
    id: profile?.id || authUser?.id,
    fullName: profile?.full_name || authUser?.user_metadata?.full_name || authUser?.email || 'User',
    email: profile?.email || authUser?.email || '',
    requiredHours: profile?.required_hours || 200,
    officeLocation: {
      latitude: profile?.office_latitude ?? 14.5995,
      longitude: profile?.office_longitude ?? 120.9842,
      radius: profile?.office_radius ?? 100,
    },
    autoCheckIn: !!profile?.auto_check_in,
  };
}

function normalizeSession(row) {
  const duration = row.duration_seconds || 0;
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    duration,
    durationFormatted: duration ? `${(duration / 3600).toFixed(2)}h` : 'Active',
    isActive: row.is_active,
    notes: row.notes || '',
    checkInLocation: {
      latitude: row.check_in_latitude,
      longitude: row.check_in_longitude,
    },
    checkOutLocation: {
      latitude: row.check_out_latitude,
      longitude: row.check_out_longitude,
    },
  };
}

async function getSupabaseProfile(token, authUser) {
  const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${authUser.id}&select=*&limit=1`, {
    method: 'GET',
    token,
  });

  if (rows?.[0]) return normalizeProfile(rows[0], authUser);

  const inserted = await supabaseFetch('/rest/v1/profiles?select=*', {
    method: 'POST',
    token,
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      id: authUser.id,
      full_name: authUser.user_metadata?.full_name || authUser.email,
      email: authUser.email,
    }),
  });

  return normalizeProfile(inserted?.[0], authUser);
}

async function expressRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return response.json();
}

const API = {
  isSupabaseConfigured: hasSupabaseConfig,

  signup: async (fullName, email, password, confirmPassword, requiredHours) => {
    if (password !== confirmPassword) {
      return { success: false, message: 'Passwords do not match' };
    }

    if (!hasSupabaseConfig()) {
      return expressRequest('/auth/signup', {
        method: 'POST',
        body: { fullName, email, password, confirmPassword, requiredHours: requiredHours || 200 },
      });
    }

    try {
      const result = await supabaseFetch('/auth/v1/signup', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          data: { full_name: fullName, required_hours: requiredHours || 200 },
        }),
      });

      if (!result.session?.access_token) {
        return {
          success: false,
          message: 'Account created. Please confirm your email, then sign in.',
        };
      }

      const user = await getSupabaseProfile(result.session.access_token, result.user);
      // Update profile with required hours
      try {
        const updated = await supabaseFetch(`/rest/v1/profiles?id=eq.${result.user.id}&select=*`, {
          method: 'PATCH',
          token: result.session.access_token,
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ required_hours: requiredHours || 200 }),
        });
        if (updated?.[0]) {
          return {
            success: true,
            message: 'Account created successfully',
            token: result.session.access_token,
            refreshToken: result.session.refresh_token,
            user: normalizeProfile(updated[0], result.user),
          };
        }
      } catch (e) {
        console.warn('Could not set required_hours:', e);
      }

      return {
        success: true,
        message: 'Account created successfully',
        token: result.session.access_token,
        refreshToken: result.session.refresh_token,
        user,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  login: async (email, password) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
    }

    try {
      const result = await supabaseFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const user = await getSupabaseProfile(result.access_token, result.user);
      return {
        success: true,
        message: 'Login successful',
        token: result.access_token,
        refreshToken: result.refresh_token,
        user,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  getMe: async (token) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/auth/me', { token });
    }

    try {
      const authUser = await supabaseFetch('/auth/v1/user', { method: 'GET', token });
      const user = await getSupabaseProfile(token, authUser);
      return { success: true, user };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  updateSettings: async (token, data) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/auth/settings', { method: 'PUT', token, body: data });
    }

    try {
      const me = await API.getMe(token);
      if (!me.success) return me;

      const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${me.user.id}&select=*`, {
        method: 'PATCH',
        token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          full_name: data.fullName || me.user.fullName,
          required_hours: data.requiredHours,
        }),
      });

      return {
        success: true,
        message: 'Settings updated',
        user: normalizeProfile(rows?.[0], { id: me.user.id, email: me.user.email }),
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  checkIn: async (token, latitude, longitude) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/sessions/check-in', {
        method: 'POST',
        token,
        body: { latitude, longitude },
      });
    }

    try {
      const me = await API.getMe(token);
      if (!me.success) return me;

      const active = await API.getCurrentSession(token);
      if (active.success && active.session) {
        return { success: false, message: 'Already checked in' };
      }

      const rows = await supabaseFetch('/rest/v1/ojt_sessions?select=*', {
        method: 'POST',
        token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: me.user.id,
          start_time: new Date().toISOString(),
          check_in_latitude: latitude,
          check_in_longitude: longitude,
          is_active: true,
        }),
      });

      return {
        success: true,
        message: 'Checked in successfully',
        session: normalizeSession(rows?.[0]),
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  checkOut: async (token, latitude, longitude, notes) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/sessions/check-out', {
        method: 'POST',
        token,
        body: { latitude, longitude, notes },
      });
    }

    try {
      const active = await API.getCurrentSession(token);
      if (!active.success || !active.session) {
        return { success: false, message: 'No active session' };
      }

      const endTime = new Date();
      const durationSeconds = Math.max(0, Math.floor((endTime - new Date(active.session.startTime)) / 1000));
      const rows = await supabaseFetch(`/rest/v1/ojt_sessions?id=eq.${active.session.id}&select=*`, {
        method: 'PATCH',
        token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          end_time: endTime.toISOString(),
          duration_seconds: durationSeconds,
          check_out_latitude: latitude,
          check_out_longitude: longitude,
          is_active: false,
          notes,
        }),
      });

      return {
        success: true,
        message: 'Checked out successfully',
        session: normalizeSession(rows?.[0]),
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  getSessions: async (token) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/sessions', { token });
    }

    try {
      const rows = await supabaseFetch('/rest/v1/ojt_sessions?select=*&order=start_time.desc', {
        method: 'GET',
        token,
      });
      return {
        success: true,
        sessions: (rows || []).map(normalizeSession),
        total: rows?.length || 0,
      };
    } catch (error) {
      return { success: false, message: error.message, sessions: [] };
    }
  },

  getCurrentSession: async (token) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/sessions/current', { token });
    }

    try {
      const rows = await supabaseFetch('/rest/v1/ojt_sessions?is_active=eq.true&select=*&limit=1', {
        method: 'GET',
        token,
      });
      return {
        success: true,
        session: rows?.[0] ? normalizeSession(rows[0]) : null,
      };
    } catch (error) {
      return { success: false, message: error.message, session: null };
    }
  },

  resetSession: async (token) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/sessions/reset', { method: 'POST', token });
    }

    try {
      const active = await API.getCurrentSession(token);
      if (!active.success || !active.session) {
        return { success: false, message: 'No active session' };
      }

      const now = new Date().toISOString();
      const rows = await supabaseFetch(`/rest/v1/ojt_sessions?id=eq.${active.session.id}&select=*`, {
        method: 'PATCH',
        token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          start_time: now,
          duration_seconds: 0,
        }),
      });

      return {
        success: true,
        message: 'Session timer reset',
        session: rows?.[0] ? normalizeSession(rows[0]) : null,
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  saveShift: async (token, shiftData) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/shifts', {
        method: 'POST',
        token,
        body: shiftData,
      });
    }

    try {
      const rows = await supabaseFetch('/rest/v1/shifts?select=*', {
        method: 'POST',
        token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(shiftData),
      });

      return {
        success: true,
        message: 'Shift saved successfully',
        shift: rows?.[0],
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  getShifts: async (token) => {
    if (!hasSupabaseConfig()) {
      return expressRequest('/shifts', { token });
    }

    try {
      const rows = await supabaseFetch('/rest/v1/shifts?select=*&order=date.desc', {
        method: 'GET',
        token,
      });
      return {
        success: true,
        shifts: rows || [],
        total: rows?.length || 0,
      };
    } catch (error) {
      return { success: false, message: error.message, shifts: [] };
    }
  },

  deleteShift: async (token, shiftId) => {
    if (!hasSupabaseConfig()) {
      return expressRequest(`/shifts/${shiftId}`, {
        method: 'DELETE',
        token,
      });
    }

    try {
      await supabaseFetch(`/rest/v1/shifts?id=eq.${shiftId}`, {
        method: 'DELETE',
        token,
      });

      return {
        success: true,
        message: 'Shift deleted successfully',
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },
};
