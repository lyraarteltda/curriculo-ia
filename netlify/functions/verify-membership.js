const https = require('https');

function supabaseRequest(method, path) {
  return new Promise(function(resolve, reject) {
    const url = new URL(path, process.env.SUPABASE_URL);
    const req = https.request(url, {
      method: method,
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      }
    }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.end();
  });
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

// A purchase grants access UNLESS its payment_status is one of these.
// Comparison is case-insensitive (the table holds 'REFUNDED', 'CANCELLED', etc.).
var DISQUALIFYING_STATUS = ['cancelled', 'canceled', 'refunded'];

function isActive(row) {
  var st = String((row && row.payment_status) || '').toLowerCase().trim();
  return DISQUALIFYING_STATUS.indexOf(st) === -1;
}

/**
 * Backend-only membership verification (Hard Rules #2, #13, #14-era model).
 * Access is granted when the e-mail OR the WhatsApp number is registered in
 * comunidade_purchases AND that purchase's payment_status is not cancelled or
 * refunded. There is NO OTP / code step — this single backend check is the
 * sole source of truth. The client may never grant access on its own.
 */
exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    var parsed = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var email = (parsed.email || '').toLowerCase().trim();
  var phone = normalizePhone(parsed.phone);
  // Significant digits: drop a country code so input with or without +55 matches.
  var phoneCore = phone.length > 11 ? phone.slice(-11) : phone;

  if (!email && !phoneCore) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Informe o e-mail ou o WhatsApp.' }) };
  }

  var select = 'select=buyer_name,buyer_email,buyer_phone,payment_status';
  var rows = [];

  // Match by registered e-mail.
  if (email) {
    var byEmail = await supabaseRequest('GET',
      '/rest/v1/comunidade_purchases?buyer_email=eq.' + encodeURIComponent(email) + '&' + select);
    try { rows = rows.concat(JSON.parse(byEmail.body) || []); } catch {}
  }

  // Match by registered WhatsApp number (stored with or without country code).
  if (phoneCore && phoneCore.length >= 10) {
    var byPhone = await supabaseRequest('GET',
      '/rest/v1/comunidade_purchases?buyer_phone=ilike.*' + encodeURIComponent(phoneCore) + '*&' + select);
    try { rows = rows.concat(JSON.parse(byPhone.body) || []); } catch {}
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      statusCode: 403,
      headers: headers,
      body: JSON.stringify({ verified: false, reason: 'not_found' })
    };
  }

  // Access is granted if ANY matching purchase is not cancelled/refunded.
  var active = rows.filter(isActive);
  if (active.length === 0) {
    return {
      statusCode: 403,
      headers: headers,
      body: JSON.stringify({ verified: false, reason: 'inactive' })
    };
  }

  var member = active[0];
  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      verified: true,
      member: {
        buyer_name: member.buyer_name,
        buyer_email: member.buyer_email,
        buyer_phone: member.buyer_phone
      }
    })
  };
};
