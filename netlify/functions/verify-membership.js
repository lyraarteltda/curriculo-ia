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
      res.on('end', function() {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

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

  if (!email) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Email é obrigatório.' }) };
  }

  var memberCheck = await supabaseRequest('GET',
    '/rest/v1/comunidade_purchases?buyer_email=eq.' + encodeURIComponent(email) +
    '&payment_status=eq.approved&select=buyer_name,buyer_email,buyer_phone&limit=1'
  );

  var members = [];
  try { members = JSON.parse(memberCheck.body); } catch {}

  if (!Array.isArray(members) || members.length === 0) {
    return {
      statusCode: 403,
      headers: headers,
      body: JSON.stringify({ verified: false, reason: 'not_found' })
    };
  }

  var member = members[0];

  if (phone) {
    var dbPhone = normalizePhone(member.buyer_phone);
    if (dbPhone && phone && !dbPhone.includes(phone) && !phone.includes(dbPhone)) {
      return {
        statusCode: 403,
        headers: headers,
        body: JSON.stringify({ verified: false, reason: 'phone_mismatch' })
      };
    }
  }

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
