// Browser-only Spotify OAuth PKCE. No client secret and no API server required.
const CLIENT_KEY = 'geekify.spotify.client-id';
const TOKEN_KEY = 'geekify.spotify.session';
const VERIFIER_KEY = 'geekify.spotify.verifier';
const STATE_KEY = 'geekify.spotify.state';
const SCOPES = 'user-read-playback-state';
const BASE = 'https://api.spotify.com/v1';

export const redirectUri = () => location.origin + '/';
export const getClientId = () => localStorage.getItem(CLIENT_KEY) || '';
export const saveClientId = (id) => localStorage.setItem(CLIENT_KEY, id.trim());
export const hasSpotifySession = () => Boolean(readSession()?.access_token || readSession()?.refresh_token);

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); }
  catch { return null; }
}
function saveSession(token) {
  const old = readSession();
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token: token.access_token,
    refresh_token: token.refresh_token || old?.refresh_token,
    expires_at: Date.now() + Math.max(30, (token.expires_in || 3600) - 60) * 1000
  }));
}
export function disconnectSpotify() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}
function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString() { return base64url(crypto.getRandomValues(new Uint8Array(48))); }

export async function beginSpotifyLogin(clientId) {
  if (!/^[a-f\d]{32}$/i.test(clientId.trim())) throw new Error('Paste a valid 32-character Spotify client ID.');
  saveClientId(clientId);
  const verifier = randomString();
  const state = randomString();
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId.trim(), scope: SCOPES,
    redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, state
  }).toString();
  location.assign(url.toString());
}

async function exchange(params) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Spotify authentication failed.');
  saveSession(payload);
  return payload.access_token;
}

export async function completeSpotifyLogin() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return false;
  const returnedState = url.searchParams.get('state');
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  history.replaceState({}, '', url.pathname + url.search + url.hash);
  if (error) throw new Error('Spotify authorization: ' + error);
  const expected = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!expected || !verifier || expected !== returnedState) throw new Error('Spotify authorization state mismatch. Reconnect from this tab.');
  const clientId = getClientId();
  if (!clientId) throw new Error('Spotify client ID is missing.');
  await exchange({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
  return true;
}

async function accessToken() {
  const session = readSession();
  if (!session) throw new Error('Your Spotify session has ended. Reconnect Spotify.');
  if (session.access_token && Date.now() < session.expires_at) return session.access_token;
  if (!session.refresh_token) throw new Error('Spotify session expired. Please reconnect.');
  return exchange({ grant_type: 'refresh_token', refresh_token: session.refresh_token, client_id: getClientId() });
}

export async function getSpotifyPlayback() {
  const token = await accessToken();
  const response = await fetch(BASE + '/me/player', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (response.status === 204) return null;
  if (response.status === 429) {
    const retry = Number(response.headers.get('Retry-After') || 10);
    const error = new Error('Spotify rate limited the request.');
    error.retryAfter = Number.isFinite(retry) ? Math.min(120, Math.max(5, retry)) : 10;
    throw error;
  }
  if (response.status === 401 || response.status === 403) throw new Error('Spotify could not access playback. Check Premium / app permissions, then reconnect.');
  if (!response.ok) throw new Error('Spotify playback request failed (' + response.status + ').');
  const data = await response.json();
  const item = data?.item;
  if (!item || item.type !== 'track') return null;
  return {
    id: item.id || item.uri, title: item.name, artist: item.artists?.map(x => x.name).join(', ') || 'Unknown artist',
    primaryArtist: item.artists?.[0]?.name || 'Unknown artist',
    album: item.album?.name || '', imageUrl: item.album?.images?.[0]?.url || '',
    durationMs: item.duration_ms || 0, progressMs: data.progress_ms || 0,
    isPlaying: Boolean(data.is_playing)
  };
}
