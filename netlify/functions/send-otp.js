const https = require('https');

function makeRequest(url, options, body) {
  return new Promise(function(resolve, reject) {
    const req = https.request(url, options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function supabaseRequest(method, path, body) {
  const url = new URL(path, process.env.SUPABASE_URL);
  return makeRequest(url, {
    method: method,
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  }, body ? JSON.stringify(body) : null);
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, '');
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
  var phone = normalizePhone(parsed.phone || '');

  if (!email || !phone) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Email e telefone são obrigatórios.' }) };
  }

  // Rate limit: max 5 OTP requests per email in 15 minutes
  var fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  var rateCheck = await supabaseRequest('GET',
    '/rest/v1/otp_codes?email=eq.' + encodeURIComponent(email) +
    '&created_at=gte.' + encodeURIComponent(fifteenMinAgo) +
    '&select=id'
  );
  var recentOtps = [];
  try { recentOtps = JSON.parse(rateCheck.body); } catch {}
  if (Array.isArray(recentOtps) && recentOtps.length >= 5) {
    return {
      statusCode: 429,
      headers: headers,
      body: JSON.stringify({ error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' })
    };
  }

  // Verify membership in comunidade_purchases
  var memberCheck = await supabaseRequest('GET',
    '/rest/v1/comunidade_purchases?buyer_email=eq.' + encodeURIComponent(email) +
    '&payment_status=eq.approved&select=buyer_name,buyer_phone&limit=1'
  );
  var members = [];
  try { members = JSON.parse(memberCheck.body); } catch {}
  if (!Array.isArray(members) || members.length === 0) {
    return {
      statusCode: 403,
      headers: headers,
      body: JSON.stringify({ error: 'E-mail não encontrado entre os membros aprovados.' })
    };
  }

  var member = members[0];
  var dbPhone = normalizePhone(member.buyer_phone || '');
  if (dbPhone && phone && !dbPhone.includes(phone) && !phone.includes(dbPhone)) {
    return {
      statusCode: 403,
      headers: headers,
      body: JSON.stringify({ error: 'O WhatsApp informado não corresponde ao cadastro.' })
    };
  }

  // Generate and store OTP
  var code = generateOTP();
  var expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseRequest('POST', '/rest/v1/otp_codes', {
    email: email,
    phone: phone,
    code: code,
    expires_at: expiresAt
  });

  // Send OTP via Z-API WhatsApp
  var whatsappPhone = phone.startsWith('55') ? phone : '55' + phone;
  var zapiUrl = 'https://api.z-api.io/instances/' + process.env.ZAPI_INSTANCE +
    '/token/' + process.env.ZAPI_TOKEN + '/send-text';

  var zapiBody = JSON.stringify({
    phone: whatsappPhone,
    message: '🔐 *Maestria da IA — Código de Verificação*\n\nSeu código: *' + code + '*\n\nEle expira em 10 minutos.\n\nSe você não solicitou este código, ignore esta mensagem.'
  });

  try {
    await makeRequest(zapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': process.env.ZAPI_CLIENT_TOKEN
      }
    }, zapiBody);
  } catch (err) {
    return {
      statusCode: 502,
      headers: headers,
      body: JSON.stringify({
        sent: false,
        error: 'Não foi possível enviar o código via WhatsApp. Tente novamente em alguns instantes.'
      })
    };
  }

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({
      sent: true,
      message: 'Código enviado para o WhatsApp ' + phone.slice(-4).padStart(phone.length, '*')
    })
  };
};
