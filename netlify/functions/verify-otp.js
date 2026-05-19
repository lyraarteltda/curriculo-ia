const https = require('https');

function supabaseRequest(method, path, body) {
  return new Promise(function(resolve, reject) {
    const url = new URL(path, process.env.SUPABASE_URL);
    const req = https.request(url, {
      method: method,
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
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
  var code = (parsed.code || '').trim();

  if (!email || !code) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Email e código são obrigatórios.' }) };
  }

  // Find the latest unused, non-expired OTP for this email
  var now = new Date().toISOString();
  var otpCheck = await supabaseRequest('GET',
    '/rest/v1/otp_codes?email=eq.' + encodeURIComponent(email) +
    '&used=eq.false' +
    '&expires_at=gte.' + encodeURIComponent(now) +
    '&order=created_at.desc&limit=1&select=id,code,attempts'
  );

  var otps = [];
  try { otps = JSON.parse(otpCheck.body); } catch {}

  if (!Array.isArray(otps) || otps.length === 0) {
    return {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ error: 'Código expirado ou inválido. Solicite um novo código.' })
    };
  }

  var otp = otps[0];

  if (otp.attempts >= 5) {
    // Mark as used to prevent further attempts
    await supabaseRequest('PATCH',
      '/rest/v1/otp_codes?id=eq.' + otp.id,
      { used: true }
    );
    return {
      statusCode: 429,
      headers: headers,
      body: JSON.stringify({ error: 'Número máximo de tentativas atingido. Solicite um novo código.' })
    };
  }

  // Increment attempts
  await supabaseRequest('PATCH',
    '/rest/v1/otp_codes?id=eq.' + otp.id,
    { attempts: otp.attempts + 1 }
  );

  if (otp.code !== code) {
    var remaining = 4 - otp.attempts;
    return {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({
        error: 'Código incorreto. ' + (remaining > 0 ? remaining + ' tentativa(s) restante(s).' : 'Solicite um novo código.')
      })
    };
  }

  // Mark OTP as used
  await supabaseRequest('PATCH',
    '/rest/v1/otp_codes?id=eq.' + otp.id,
    { used: true }
  );

  // Get member info for the session
  var memberCheck = await supabaseRequest('GET',
    '/rest/v1/comunidade_purchases?buyer_email=eq.' + encodeURIComponent(email) +
    '&payment_status=eq.approved&select=buyer_name,buyer_email,buyer_phone&limit=1'
  );
  var members = [];
  try { members = JSON.parse(memberCheck.body); } catch {}
  var member = members.length > 0 ? members[0] : { buyer_name: 'Maestro', buyer_email: email, buyer_phone: '' };

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      verified: true,
      member: member
    })
  };
};
