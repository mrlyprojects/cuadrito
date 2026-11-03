'use strict';

class UsageError extends Error {
  constructor(kind, retryAfterSec) {
    super(kind);
    this.kind = kind; // signedOut | rateLimited | blocked | offline | format
    this.retryAfterSec = retryAfterSec;
  }
}

async function getJson(fetcher, path) {
  let response;
  try {
    response = await fetcher(path);
  } catch {
    throw new UsageError('offline');
  }
  const type = response.headers.get('content-type') || '';
  if (response.status === 429) {
    throw new UsageError('rateLimited', Number(response.headers.get('retry-after')) || undefined);
  }
  // A Cloudflare challenge also answers 403, with a page instead of JSON.
  if (!type.includes('json')) throw new UsageError('blocked');
  if (response.status === 401 || response.status === 403) throw new UsageError('signedOut');
  if (!response.ok) throw new UsageError('blocked');
  try {
    return await response.json();
  } catch {
    throw new UsageError('format');
  }
}

function pickOrganization(organizations, preferredId) {
  if (!Array.isArray(organizations) || organizations.length === 0) throw new UsageError('signedOut');
  return (
    organizations.find((o) => o.uuid === preferredId) ||
    organizations.find((o) => (o.capabilities || []).includes('chat')) ||
    organizations[0]
  );
}

function parseWindow(raw) {
  if (!raw || typeof raw.utilization !== 'number') return null;
  return {
    percent: Math.min(Math.max(raw.utilization, 0), 100),
    resetsAt: typeof raw.resets_at === 'string' ? raw.resets_at : null,
  };
}

function parseUsage(raw) {
  const five = parseWindow(raw && raw.five_hour);
  const week = parseWindow(raw && raw.seven_day);
  if (!five && !week) throw new UsageError('format');
  return { five, week };
}

// fetcher(path) answers like fetch, with the signed-in session's cookies.
async function fetchUsage(fetcher, preferredOrgId) {
  const organizations = await getJson(fetcher, '/api/organizations');
  const organization = pickOrganization(organizations, preferredOrgId);
  const raw = await getJson(fetcher, `/api/organizations/${encodeURIComponent(organization.uuid)}/usage`);
  return parseUsage(raw);
}

module.exports = { UsageError, fetchUsage, parseUsage, pickOrganization };
