/**
 * Kill Switch — checks app_config table for tools_enabled flag.
 * If disabled, shows a branded maintenance message and blocks the app.
 * Include this in every built tool — load BEFORE membership-gate.js.
 *
 * To disable all tools: UPDATE app_config SET value='false', updated_at=now() WHERE key='tools_enabled';
 * To re-enable:         UPDATE app_config SET value='true',  updated_at=now() WHERE key='tools_enabled';
 */
const KillSwitch = (function() {
  const CHECK_INTERVAL = 5 * 60 * 1000; // re-check every 5 minutes
  let _isEnabled = true;
  let _checkTimer = null;

  async function checkStatus() {
    try {
      const sb = window.AppSupabase.getClient();
      const { data } = await sb
        .from('app_config')
        .select('value')
        .eq('key', 'tools_enabled')
        .limit(1)
        .single();

      _isEnabled = !data || data.value === 'true';

      if (!_isEnabled) {
        showMaintenancePage();
      }

      return _isEnabled;
    } catch {
      return true;
    }
  }

  function showMaintenancePage() {
    document.querySelectorAll('.screen').forEach(function(s) {
      s.classList.remove('active');
      s.style.display = 'none';
    });

    let overlay = document.getElementById('killswitch-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'killswitch-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#0a0a0f;';
    overlay.innerHTML = '<div style="text-align:center;max-width:480px;padding:32px;">' +
      '<div style="font-size:48px;margin-bottom:24px;">🔧</div>' +
      '<h1 style="font-size:28px;font-weight:800;margin-bottom:16px;background:linear-gradient(135deg,#fff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Em Manutenção</h1>' +
      '<p style="color:#9ca3af;font-size:16px;line-height:1.6;margin-bottom:24px;">Estamos realizando melhorias nesta ferramenta. Ela estará de volta em breve.</p>' +
      '<div style="display:inline-block;background:rgba(167,139,250,.12);color:#a78bfa;padding:8px 20px;border-radius:100px;font-size:13px;font-weight:600;border:1px solid rgba(167,139,250,.2);">Maestria da IA</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  function startPeriodicCheck() {
    if (_checkTimer) clearInterval(_checkTimer);
    _checkTimer = setInterval(checkStatus, CHECK_INTERVAL);
  }

  async function init() {
    const enabled = await checkStatus();
    if (enabled) {
      startPeriodicCheck();
    }
    return enabled;
  }

  return {
    init: init,
    checkStatus: checkStatus,
    isEnabled: function() { return _isEnabled; }
  };
})();

window.KillSwitch = KillSwitch;
