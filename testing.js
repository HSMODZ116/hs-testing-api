export default {
  async fetch(request) {
    const url = new URL(request.url);
    const inputUrl = url.searchParams.get('url');

    // Step 1: Validate Input
    if (!inputUrl || !inputUrl.includes('instagram.com')) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Missing or invalid Instagram URL'
        }, null, 2),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const encodedUrl = encodeURIComponent(inputUrl);
    const targetUrl = `https://snapdownloader.com/tools/instagram-reels-downloader/download?url=${encodedUrl}`;

    // Step 2: Advanced Fetch with real browser-like headers
    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://snapdownloader.com/',
          'Origin': 'https://snapdownloader.com',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow'
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Request failed',
          credit: '@hsmodzofc2'
        }, null, 2),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: `HTTP ${response.status} from snapdownloader`,
          credit: '@hsmodzofc2'
        }, null, 2),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();

    // Step 4: Extract Video URL (.mp4)
    const videoRegex = /<a[^>]+href="([^"]*\.mp4[^"]*)"[^>]*>/i;
    const videoMatch = html.match(videoRegex);
    let videoUrl = videoMatch ? decodeURIComponent(videoMatch[1].replace(/&amp;/g, '&')) : '';

    // Step 5: Extract Thumbnail (.jpg)
    const thumbRegex = /<a[^>]+href="([^"]*\.jpg[^"]*)"[^>]*>/i;
    const thumbMatch = html.match(thumbRegex);
    let thumbUrl = thumbMatch ? decodeURIComponent(thumbMatch[1].replace(/&amp;/g, '&')) : '';

    // Step 6: Final Response
    if (videoUrl && videoUrl.includes('.mp4')) {
      return new Response(
        JSON.stringify({
          status: 'success',
          video: videoUrl,
          thumbnail: thumbUrl || null,
          channel: '@hsmodzofc2'  // Aapka credit
        }, null, 2),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          }
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Video not found in response',
          channel: '@hsmodzofc2'
        }, null, 2),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
};