import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { service } = await req.json().catch(() => ({}));

    if (service === 'scrapingbee') {
      const settingsRows = await base44.asServiceRole.entities.AppSettings.list('-created_date', 1);
      const settings = settingsRows[0] || {};
      const apiKey = settings.scrapingbee_api_key || Deno.env.get('SCRAPINGBEE_API_KEY');

      if (!apiKey) {
        return Response.json({ ok: false, status: 'Not Configured', message: 'No ScrapingBee API Key found in settings or secrets.' });
      }

      const res = await fetch(`https://app.scrapingbee.com/api/v1/usage?api_key=${encodeURIComponent(apiKey)}`);
      if (res.ok) {
        const usage = await res.json();
        return Response.json({ 
          ok: true, 
          status: 'Connected', 
          details: `Max API calls: ${usage.max_api_calls}, Used: ${usage.used_api_calls}`,
          capabilities: {
            screenshots: true,
            recordings: false,
            live_viewing: false
          }
        });
      } else {
        return Response.json({ ok: false, status: 'Error', message: `ScrapingBee API error: ${res.status}` });
      }
    } 
    else if (service === 'browserless') {
      const token = Deno.env.get('BROWSERLESS_TOKEN');

      if (!token) {
        return Response.json({ ok: false, status: 'Not Configured', message: 'No BROWSERLESS_TOKEN found in secrets.' });
      }

      // Check active sessions endpoint
      const res = await fetch(`https://chrome.browserless.io/sessions?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const sessions = await res.json();
        return Response.json({ 
          ok: true, 
          status: 'Connected', 
          details: `Active Sessions: ${sessions.length || 0}`,
          sessions: sessions,
          capabilities: {
            screenshots: true,
            recordings: true,
            live_viewing: true
          }
        });
      } else {
        return Response.json({ ok: false, status: 'Error', message: `Browserless API error: ${res.status}` });
      }
    }

    return Response.json({ ok: false, error: 'Unknown service requested' }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});