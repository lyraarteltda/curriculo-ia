/**
 * Rate Limiter — enforces per-member request limits via Supabase.
 * Caps: 60 req/min, 500 req/hour per member per endpoint.
 * Include this in every built tool.
 */
const RateLimiter = (function() {
  const LIMITS = {
    minute: { max: 60, windowMs: 60 * 1000 },
    hour:   { max: 500, windowMs: 60 * 60 * 1000 }
  };

  function getWindowStart(windowMs) {
    const now = Date.now();
    return new Date(now - (now % windowMs)).toISOString();
  }

  async function checkLimit(endpoint) {
    const session = window.MembershipGate ? MembershipGate.getSession() : null;
    const email = session ? session.email : 'anonymous';
    const sb = window.AppSupabase.getClient();

    for (const [period, config] of Object.entries(LIMITS)) {
      const windowStart = getWindowStart(config.windowMs);

      const { data: existing } = await sb
        .from('rate_limits')
        .select('request_count')
        .eq('member_email', email)
        .eq('endpoint', endpoint)
        .eq('window_start', windowStart)
        .limit(1)
        .single();

      if (existing && existing.request_count >= config.max) {
        return {
          allowed: false,
          message: `Limite de requisições atingido (${config.max}/${period === 'minute' ? 'minuto' : 'hora'}). Aguarde um momento e tente novamente.`,
          retryAfterMs: config.windowMs
        };
      }
    }
    return { allowed: true };
  }

  async function recordRequest(endpoint) {
    const session = window.MembershipGate ? MembershipGate.getSession() : null;
    const email = session ? session.email : 'anonymous';
    const sb = window.AppSupabase.getClient();

    for (const [, config] of Object.entries(LIMITS)) {
      const windowStart = getWindowStart(config.windowMs);

      const { data: existing } = await sb
        .from('rate_limits')
        .select('request_count')
        .eq('member_email', email)
        .eq('endpoint', endpoint)
        .eq('window_start', windowStart)
        .limit(1)
        .single();

      if (existing) {
        const headers = sb._headers ? sb._headers() : {
          'apikey': sb._key,
          'Authorization': 'Bearer ' + sb._key,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        };
        await fetch(
          sb._url + '/rest/v1/rate_limits?member_email=eq.' + encodeURIComponent(email) +
          '&endpoint=eq.' + encodeURIComponent(endpoint) +
          '&window_start=eq.' + encodeURIComponent(windowStart),
          {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify({ request_count: existing.request_count + 1 })
          }
        );
      } else {
        await sb.from('rate_limits').insert({
          member_email: email,
          endpoint: endpoint,
          window_start: windowStart,
          request_count: 1
        });
      }
    }
  }

  async function executeWithLimit(endpoint, fn) {
    const check = await checkLimit(endpoint);
    if (!check.allowed) {
      showRateLimitMessage(check.message);
      return null;
    }
    await recordRequest(endpoint);
    return fn();
  }

  function showRateLimitMessage(message) {
    let el = document.getElementById('rate-limit-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rate-limit-toast';
      el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1020;border:1px solid rgba(239,68,68,.4);color:#ef4444;padding:16px 24px;border-radius:12px;z-index:10000;font-size:14px;max-width:90%;text-align:center;backdrop-filter:blur(8px);';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 5000);
  }

  return {
    checkLimit: checkLimit,
    recordRequest: recordRequest,
    executeWithLimit: executeWithLimit,
    LIMITS: LIMITS
  };
})();

window.RateLimiter = RateLimiter;
