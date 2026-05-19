/**
 * Error Monitor — captures uncaught errors and failed fetches.
 * Logs to Supabase error_log table for monitoring.
 */
const ErrorMonitor = (function() {
  const TOOL_SLUG = 'curriculo-ia';
  const MAX_ERRORS_PER_SESSION = 20;
  let _errorCount = 0;

  function getMemberEmail() {
    var session = window.MembershipGate ? MembershipGate.getSession() : null;
    return session ? session.email : null;
  }

  async function logError(errorType, message, stack, url) {
    if (_errorCount >= MAX_ERRORS_PER_SESSION) return;
    _errorCount++;

    try {
      var sb = window.AppSupabase.getClient();
      await sb.from('error_log').insert({
        tool_slug: TOOL_SLUG,
        member_email: getMemberEmail(),
        error_type: errorType,
        message: (message || '').substring(0, 1000),
        stack: (stack || '').substring(0, 2000),
        url: (url || window.location.href).substring(0, 500)
      });
    } catch {}
  }

  function init() {
    window.addEventListener('error', function(e) {
      logError('uncaught', e.message, e.error ? e.error.stack : '', e.filename);
    });

    window.addEventListener('unhandledrejection', function(e) {
      var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled rejection';
      var stack = e.reason ? (e.reason.stack || '') : '';
      logError('unhandled_rejection', msg, stack);
    });

    var originalFetch = window.fetch;
    window.fetch = function() {
      return originalFetch.apply(this, arguments).then(function(response) {
        if (!response.ok && response.status >= 500) {
          logError('fetch_error', 'HTTP ' + response.status + ' ' + response.statusText, '', response.url);
        }
        return response;
      }).catch(function(err) {
        logError('fetch_error', err.message, err.stack, arguments[0]);
        throw err;
      });
    };
  }

  return {
    init: init,
    logError: logError
  };
})();

window.ErrorMonitor = ErrorMonitor;

document.addEventListener('DOMContentLoaded', function() {
  ErrorMonitor.init();
});
