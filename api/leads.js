/**
 * Lead capture API handler (stub).
 * Wire this into your server and persist submissions to a database.
 *
 * Expected POST body: { name, email, country }
 * Returns: { ok: true }
 */

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function validateLead(body) {
  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const country = (body.country || '').trim();
  if (!name || !email || !country) {
    return { error: 'Name, email, and country are required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  return { name, email, country };
}

async function handleLead(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' });
    res.end();
    return;
  }

  try {
    const body = await readJsonBody(req);
    const lead = validateLead(body);
    if (lead.error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: lead.error }));
      return;
    }

    // TODO: save lead to database
    console.log('Lead capture:', lead);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Invalid request.' }));
  }
}

module.exports = { handleLead, validateLead };
