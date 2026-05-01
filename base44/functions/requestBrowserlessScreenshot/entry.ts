import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { target_url } = body;
    if (!target_url) {
      return Response.json({ error: 'target_url is required' }, { status: 400 });
    }

    const token = Deno.env.get('BROWSERLESS_TOKEN');
    if (!token) {
      return Response.json({ error: 'BROWSERLESS_TOKEN is not configured' }, { status: 500 });
    }

    const res = await fetch(`https://chrome.browserless.io/screenshot?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: target_url,
        options: {
          type: 'jpeg',
          quality: 80,
          fullPage: true
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `Browserless returned ${res.status}: ${errText}` }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

    return Response.json({ screenshot_b64: base64 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});