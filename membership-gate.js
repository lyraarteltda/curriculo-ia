/**
 * Membership Gate — BACKEND-ONLY verification, single step.
 *
 * The member types their e-mail and WhatsApp number. The backend
 * verify-membership function looks them up in comunidade_purchases and
 * grants access when the e-mail OR the WhatsApp is registered with a
 * payment_status that is NOT cancelled or refunded.
 *
 * There is NO OTP / verification-code step. The client NEVER decides
 * access — it only reflects what the backend returned. localStorage is a
 * display cache; every page load revalidates against the backend.
 */
const MembershipGate = (function() {
  const SESSION_KEY = 'maestria_member_session';
  const SESSION_DURATION = 24 * 60 * 60 * 1000;

  const LOGIN_RATE_KEY = 'maestria_login_attempts';
  const LOGIN_RATE_WINDOW = 15 * 60 * 1000;
  const LOGIN_RATE_MAX = 8;

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (Date.now() - session.timestamp > SESSION_DURATION) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function storeSession(member) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      email: member.buyer_email,
      name: member.buyer_name,
      phone: member.buyer_phone,
      timestamp: Date.now()
    }));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function normalizePhone(phone) {
    return (phone || '').replace(/\D/g, '');
  }

  function checkLoginRateLimit() {
    try {
      const raw = localStorage.getItem(LOGIN_RATE_KEY);
      if (!raw) return true;
      const data = JSON.parse(raw);
      const validAttempts = data.filter(function(t) { return Date.now() - t < LOGIN_RATE_WINDOW; });
      localStorage.setItem(LOGIN_RATE_KEY, JSON.stringify(validAttempts));
      return validAttempts.length < LOGIN_RATE_MAX;
    } catch {
      return true;
    }
  }

  function recordLoginAttempt() {
    try {
      const raw = localStorage.getItem(LOGIN_RATE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      data.push(Date.now());
      localStorage.setItem(LOGIN_RATE_KEY, JSON.stringify(data));
    } catch {}
  }

  async function verifyMembershipBackend(email, phone) {
    try {
      var resp = await fetch('/.netlify/functions/verify-membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined, phone: phone || undefined })
      });
      return await resp.json();
    } catch {
      return { verified: false, reason: 'error' };
    }
  }

  async function revalidateSession() {
    const session = getStoredSession();
    if (!session) return false;

    var result = await verifyMembershipBackend(session.email, session.phone);

    if (!result.verified) {
      clearSession();
      showScreen('gate-screen');
      return false;
    }

    storeSession(result.member);
    return true;
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    if (screenId === 'app-screen') {
      document.dispatchEvent(new Event('maestria:app-ready'));
    }
  }

  function getErrorMessage(reason) {
    switch (reason) {
      case 'not_found':
        return 'E-mail e WhatsApp não encontrados entre os membros da comunidade. Use os mesmos dados cadastrados na compra.';
      case 'inactive':
        return 'Seu acesso consta como cancelado ou reembolsado. Se isso estiver incorreto, fale com o suporte.';
      case 'rate_limited':
        return 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.';
      case 'error':
        return 'Erro ao verificar o acesso. Tente novamente em alguns segundos.';
      default:
        return 'Não foi possível verificar o acesso. Tente novamente.';
    }
  }

  async function handleGateSubmit(e) {
    e.preventDefault();

    var emailInput = document.getElementById('gate-email');
    var phoneInput = document.getElementById('gate-phone');
    var submitBtn = document.getElementById('gate-submit');
    var errorEl = document.getElementById('gate-error');
    var btnText = submitBtn.querySelector('.btn-text');
    var btnLoading = submitBtn.querySelector('.btn-loading');

    if (!checkLoginRateLimit()) {
      errorEl.textContent = getErrorMessage('rate_limited');
      errorEl.style.display = 'block';
      return;
    }

    recordLoginAttempt();
    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    try {
      var email = emailInput.value.toLowerCase().trim();
      var phone = normalizePhone(phoneInput.value);

      var result = await verifyMembershipBackend(email, phone);

      if (result.verified && result.member) {
        storeSession(result.member);
        var nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = result.member.buyer_name || 'Maestro';
        showScreen('key-screen');
        if (window.ApiKeyManager) window.ApiKeyManager.renderInputs();
      } else {
        errorEl.textContent = getErrorMessage(result.reason);
        errorEl.style.display = 'block';
      }
    } catch (err) {
      errorEl.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }

  async function init() {
    var session = getStoredSession();
    if (session) {
      var nameEl = document.getElementById('user-name');
      if (nameEl) nameEl.textContent = session.name || 'Maestro';

      var valid = await revalidateSession();
      if (valid) {
        showScreen('key-screen');
        if (window.ApiKeyManager) {
          var hasKeys = window.ApiKeyManager.hasRequiredKeys();
          if (hasKeys) showScreen('app-screen');
        }
        return;
      }
    }

    showScreen('gate-screen');

    var form = document.getElementById('gate-form');
    if (form) form.addEventListener('submit', handleGateSubmit);

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        clearSession();
        showScreen('gate-screen');
      });
    }
  }

  return {
    init: init,
    getSession: getStoredSession,
    clearSession: clearSession,
    showScreen: showScreen,
    revalidateSession: revalidateSession
  };
})();

// Expose on window — rate-limiter.js, analytics.js and error-monitor.js
// look up window.MembershipGate. A bare top-level `const` is NOT a window
// property, so without this they silently fall back to anonymous/null
// (global rate limiting instead of per-member, lost analytics attribution).
window.MembershipGate = MembershipGate;

document.addEventListener('DOMContentLoaded', function() {
  MembershipGate.init();
});
