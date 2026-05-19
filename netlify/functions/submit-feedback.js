const https = require('https');

function makeRequest(url, options, body) {
  return new Promise(function(resolve, reject) {
    const req = https.request(url, options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
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

  var toolSlug = (parsed.tool_slug || '').trim();
  var email = (parsed.member_email || '').trim();
  var type = (parsed.type || '').trim();
  var message = (parsed.message || '').trim();

  if (!type || !message) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Tipo e mensagem são obrigatórios.' }) };
  }

  // Save to Supabase
  await supabaseRequest('POST', '/rest/v1/feedback', {
    tool_slug: toolSlug,
    member_email: email,
    type: type,
    message: message
  });

  // Send WhatsApp notification to Arthur
  if (process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN) {
    var zapiUrl = 'https://api.z-api.io/instances/' + process.env.ZAPI_INSTANCE +
      '/token/' + process.env.ZAPI_TOKEN + '/send-text';

    var whatsappMsg = '*📣 Novo Feedback — ' + (toolSlug || 'Ferramenta') + '*\n\n' +
      '*Tipo:* ' + (type === 'bug' ? '🐛 Bug' : '💡 Sugestão') + '\n' +
      '*Membro:* ' + (email || 'Anônimo') + '\n' +
      '*Mensagem:* ' + message.substring(0, 500);

    try {
      await makeRequest(zapiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': process.env.ZAPI_CLIENT_TOKEN || ''
        }
      }, JSON.stringify({
        phone: process.env.ARTHUR_WHATSAPP || '5511997352416',
        message: whatsappMsg
      }));
    } catch {}
  }

  return {
    statusCode: 200,
    headers: headers,
    body: JSON.stringify({ success: true, message: 'Feedback enviado com sucesso! Obrigado.' })
  };
};
