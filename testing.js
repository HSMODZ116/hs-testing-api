// spotmate-worker.js
const SPOTMATE_BASE = "https://spotmate.online";

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    try {
      const { url, action = 'download' } = await request.json();
      
      if (!url) {
        return new Response(JSON.stringify({ error: 'URL is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Initialize session first
      const sessionData = await initSession();
      
      if (action === 'getTrackData') {
        const trackData = await getTrackData(url, sessionData);
        return new Response(JSON.stringify(trackData), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } else if (action === 'convert') {
        const convertData = await convertTrack(url, sessionData);
        return new Response(JSON.stringify(convertData), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } else {
        // Full download process
        const result = await processDownload(url, sessionData);
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
};

// Initialize session and get CSRF token
async function initSession() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'upgrade-insecure-requests': '1'
  };

  const response = await fetch(`${SPOTMATE_BASE}/en1`, { headers });
  const html = await response.text();
  
  // Extract CSRF token
  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : null;
  
  // Get cookies
  const cookies = response.headers.get('set-cookie') || '';
  
  return {
    csrfToken,
    cookies,
    headers: response.headers
  };
}

// Get track data
async function getTrackData(spotifyUrl, session) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'sec-ch-ua-platform': '"Android"',
    'x-csrf-token': session.csrfToken,
    'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'origin': SPOTMATE_BASE,
    'referer': `${SPOTMATE_BASE}/en1`,
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Cookie': session.cookies
  };

  const payload = { spotify_url: spotifyUrl };
  
  const response = await fetch(`${SPOTMATE_BASE}/getTrackData`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return await response.json();
}

// Convert track
async function convertTrack(spotifyUrl, session) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'sec-ch-ua-platform': '"Android"',
    'x-csrf-token': session.csrfToken,
    'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'origin': SPOTMATE_BASE,
    'referer': `${SPOTMATE_BASE}/en1`,
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Cookie': session.cookies
  };

  const payload = { urls: spotifyUrl };
  
  const response = await fetch(`${SPOTMATE_BASE}/convert`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return await response.json();
}

// Full download process
async function processDownload(spotifyUrl, session) {
  // Step 1: Get track data
  const trackData = await getTrackData(spotifyUrl, session);
  if (!trackData) {
    throw new Error('Failed to get track data');
  }

  // Step 2: Convert track
  const convertData = await convertTrack(spotifyUrl, session);
  if (!convertData) {
    throw new Error('Failed to convert track');
  }

  // Extract download URL
  let downloadUrl;
  if (convertData.download_url) {
    downloadUrl = convertData.download_url;
  } else if (convertData.url) {
    downloadUrl = convertData.url;
  } else if (convertData.data && convertData.data.download_url) {
    downloadUrl = convertData.data.download_url;
  } else {
    throw new Error('Could not find download URL');
  }

  // Step 3: Get download link
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
    'Accept': '*/*',
    'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'referer': `${SPOTMATE_BASE}/`,
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8'
  };

  // Return the download URL instead of downloading the file
  // (Workers can't save files directly)
  return {
    success: true,
    download_url: downloadUrl,
    track_info: trackData,
    direct_download: `${SPOTMATE_BASE}/proxy?url=${encodeURIComponent(downloadUrl)}`
  };
}