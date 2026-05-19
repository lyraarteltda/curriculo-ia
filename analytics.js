/**
 * Analytics — lightweight, privacy-respecting usage tracking.
 * Logs tool opens and key actions to Supabase tool_events table.
 * Uses anon key only (RLS: members can insert, not read others').
 */
const Analytics = (function() {
  const TOOL_SLUG = 'curriculo-ia';
  let _tracked = false;

  function getMemberEmail() {
    var session = window.MembershipGate ? MembershipGate.getSession() : null;
    return session ? session.email : null;
  }

  async function track(eventType, eventData) {
    try {
      var sb = window.AppSupabase.getClient();
      await sb.from('tool_events').insert({
        tool_slug: TOOL_SLUG,
        member_email: getMemberEmail(),
        event_type: eventType,
        event_data: eventData || null
      });
    } catch {}
  }

  function trackPageView() {
    if (_tracked) return;
    _tracked = true;
    track('page_view', {
      referrer: document.referrer || null,
      viewport: window.innerWidth + 'x' + window.innerHeight
    });
  }

  function trackAction(action, data) {
    track('action', Object.assign({ action: action }, data || {}));
  }

  function init() {
    var session = window.MembershipGate ? MembershipGate.getSession() : null;
    if (session) {
      trackPageView();
    } else {
      var observer = new MutationObserver(function() {
        if (document.getElementById('app-screen') &&
            document.getElementById('app-screen').classList.contains('active')) {
          trackPageView();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  }

  return {
    init: init,
    track: track,
    trackAction: trackAction
  };
})();

window.Analytics = Analytics;

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() { Analytics.init(); }, 200);
});
