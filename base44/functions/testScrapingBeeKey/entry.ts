import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Ensure only admins can validate and set keys
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { api_key } = body;
    
    if (!api_key) {
      return Response.json({ ok: false, error: 'No API key provided' });
    }

    // Call ScrapingBee's usage endpoint to validate the key
    const res = await fetch(`https://app.scrapingbee.com/api/v1/usage?api_key=${encodeURIComponent(api_key)}`);
    
    if (res.ok) {
      const usageData = await res.json();
      return Response.json({ ok: true, usage: usageData });
    } else {
      const text = await res.text();
      return Response.json({ ok: false, error: `Invalid API key (ScrapingBee returned ${res.status})` });
    }
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});