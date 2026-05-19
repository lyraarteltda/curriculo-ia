/**
 * Supabase Client — initialized with the community anon key.
 * Service role key is NEVER used in frontend code.
 */
const SUPABASE_CONFIG = {
  url: 'https://arsfqjhvgphsglouwdsn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyc2Zxamh2Z3Boc2dsb3V3ZHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNjA3MDAsImV4cCI6MjA3MTczNjcwMH0.WvzZ9m2tyxT0XgnWOpOFGop8gMk7fgLVwFSIaNiH62Q'
};

let _supabaseClient = null;

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;

  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    _supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return _supabaseClient;
  }

  _supabaseClient = {
    _url: SUPABASE_CONFIG.url,
    _key: SUPABASE_CONFIG.anonKey,

    _headers(prefer) {
      return {
        'apikey': this._key,
        'Authorization': `Bearer ${this._key}`,
        'Content-Type': 'application/json',
        'Prefer': prefer || 'return=representation'
      };
    },

    from(table) {
      const self = this;
      let _filters = [];
      let _selectFields = '*';
      let _limit = null;
      let _single = false;

      const builder = {
        select(fields) {
          _selectFields = fields || '*';
          return this;
        },
        eq(column, value) {
          _filters.push(`${column}=eq.${encodeURIComponent(value)}`);
          return this;
        },
        ilike(column, value) {
          _filters.push(`${column}=ilike.${encodeURIComponent(value)}`);
          return this;
        },
        limit(n) {
          _limit = n;
          return this;
        },
        single() {
          _single = true;
          _limit = 1;
          return this;
        },
        async insert(data) {
          try {
            const resp = await fetch(`${self._url}/rest/v1/${table}`, {
              method: 'POST',
              headers: self._headers('return=minimal'),
              body: JSON.stringify(data)
            });
            if (!resp.ok) return { data: null, error: { message: await resp.text() } };
            return { data: Array.isArray(data) ? data : [data], error: null };
          } catch (e) {
            return { data: null, error: { message: e.message } };
          }
        },
        async then(resolve) {
          try {
            let url = `${self._url}/rest/v1/${table}?select=${encodeURIComponent(_selectFields)}`;
            if (_filters.length) url += '&' + _filters.join('&');
            if (_limit) url += `&limit=${_limit}`;

            const resp = await fetch(url, { headers: self._headers() });
            if (!resp.ok) {
              resolve({ data: null, error: { message: await resp.text() } });
              return;
            }
            let result = await resp.json();
            if (_single) result = result[0] || null;
            resolve({ data: result, error: null });
          } catch (e) {
            resolve({ data: null, error: { message: e.message } });
          }
        }
      };

      return builder;
    }
  };

  return _supabaseClient;
}

window.AppSupabase = { getClient: getSupabaseClient, config: SUPABASE_CONFIG };
