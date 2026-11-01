const cache = new Map();

export function parseLrc(source) {
  if (!source || typeof source !== 'string') return [];
  const lines = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const times = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!times.length) continue;
    const text = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    if (!text) continue;
    for (const match of times) {
      const fraction = match[3] ? Number('0.' + match[3]) : 0;
      lines.push({ timeMs: (Number(match[1]) * 60 + Number(match[2]) + fraction) * 1000, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export function lyricIndex(lines, elapsedMs) {
  let left = 0, right = lines.length - 1, answer = -1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (lines[mid].timeMs <= elapsedMs) { answer = mid; left = mid + 1; }
    else right = mid - 1;
  }
  return answer;
}

export async function fetchLyrics(track, signal) {
  if (!track?.title || !track?.primaryArtist) return null;
  const signature = [track.title, track.primaryArtist, track.album, track.durationMs].join('|');
  if (cache.has(signature)) return cache.get(signature);
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.primaryArtist });
  if (track.album) params.set('album_name', track.album);
  if (track.durationMs) params.set('duration', String(Math.round(track.durationMs / 1000)));
  const response = await fetch('https://lrclib.net/api/get?' + params, { signal });
  if (response.status === 404) { cache.set(signature, null); return null; }
  if (!response.ok) throw new Error('Lyrics provider returned ' + response.status);
  const payload = await response.json();
  const result = payload.instrumental ? null : parseLrc(payload.syncedLyrics);
  const lyrics = result?.length ? result : null;
  cache.set(signature, lyrics);
  return lyrics;
}
