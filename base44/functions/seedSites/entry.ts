import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_SITES = [
  {
    key: 'joe',
    label: 'Joe',
    login_url: 'https://www.joefortunepokies.eu/login',
    username_selector: "input[type='email'], input[name='username']",
    password_selector: "input[type='password']",
    submit_selector: "button[type='submit']",
    success_selector: '.ol-alert__content.ol-alert__content--status_success',
    login_url_marker: '/login',
    wait_after_submit_ms: 3500,
    enabled: true,
  },
  {
    key: 'ignition',
    label: 'Ignition',
    login_url: 'https://www.ignitioncasino.ooo/login',
    username_selector: '#username',
    password_selector: '#password',
    submit_selector: '#loginSubmit',
    success_selector: '.ol-alert__content.ol-alert__content--status_success',
    login_url_marker: '/login',
    wait_after_submit_ms: 3500,
    enabled: true,
  },
  {
    key: 'ppsr',
    label: 'PPSR',
    login_url: 'https://example.com/login',
    username_selector: "input[type='email'], input[name='username']",
    password_selector: "input[type='password']",
    submit_selector: "button[type='submit']",
    success_selector: '.ol-alert__content.ol-alert__content--status_success',
    login_url_marker: '/login',
    wait_after_submit_ms: 3500,
    enabled: true,
  },
  {
    key: 'double',
    label: 'Double (Joe + Ignition)',
    login_url: '',
    username_selector: "input[type='email'], input[name='username']",
    password_selector: "input[type='password']",
    submit_selector: "button[type='submit']",
    success_selector: '.ol-alert__content.ol-alert__content--status_success',
    login_url_marker: '/login',
    wait_after_submit_ms: 3500,
    enabled: true,
    secondary_site_keys: ['joe', 'ignition'],
    skip_primary: true,
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const existing = await base44.asServiceRole.entities.Site.list('-created_date', 100);
    const keys = new Set(existing.map((s) => s.key));
    const toCreate = DEFAULT_SITES.filter((s) => !keys.has(s.key));
    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.Site.bulkCreate(toCreate);
    }
    return Response.json({ created: toCreate.length, existing: existing.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});