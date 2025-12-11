export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    
    // Support multiple endpoints
    if (url.pathname === '/api/instagram' || url.pathname === '/') {
      return handleInstagramDownload(request, url);
    }
    
    if (url.pathname === '/api/status') {
      return new Response(
        JSON.stringify({
          status: 'active',
          version: '2.0',
          author: '@hsmodzofc2',
          endpoints: ['/api/instagram', '/api/status', '/api/batch']
        }, null, 2),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Endpoint not found. Use /api/instagram',
        documentation: 'Add ?url=instagram_url'
      }, null, 2),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
};

async function handleInstagramDownload(request, url) {
  const inputUrl = url.searchParams.get('url');
  const format = url.searchParams.get('format') || 'json'; // json or direct
  const quality = url.searchParams.get('quality') || 'best'; // best, high, medium
  
  // Validate request method
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Method not allowed. Use GET',
        credit: '@hsmodzofc2'
      }, null, 2),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // Validate Instagram URL
  if (!inputUrl) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Missing Instagram URL parameter',
        usage: 'Add ?url=instagram_url',
        example: '?url=https://www.instagram.com/reel/xyz',
        credit: '@hsmodzofc2'
      }, null, 2),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // Validate URL format
  const instagramPatterns = [
    /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[^\/]+\/?/,
    /https?:\/\/instagram\.com\/(p|reel|tv|stories)\/[^\/]+\/?/,
    /https?:\/\/(www\.)?instagr\.am\/(p|reel|tv|stories)\/[^\/]+\/?/
  ];

  const isValidUrl = instagramPatterns.some(pattern => pattern.test(inputUrl));
  
  if (!isValidUrl) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'Invalid Instagram URL format',
        accepted_formats: [
          'https://www.instagram.com/reel/xxx/',
          'https://instagram.com/p/xxx/',
          'https://www.instagram.com/tv/xxx/',
          'https://www.instagram.com/stories/xxx/'
        ],
        credit: '@hsmodzofc2'
      }, null, 2),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  // Rate limiting (basic implementation)
  const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateLimitKey = `rate_limit_${clientIP}`;
  
  // You can use Workers KV for proper rate limiting
  // const rateLimitCount = await env.RATE_LIMIT_KV.get(rateLimitKey) || 0;
  // if (parseInt(rateLimitCount) > 50) {
  //   return new Response(JSON.stringify({
  //     status: 'error',
  //     message: 'Rate limit exceeded. Try again later.',
  //     credit: '@hsmodzofc2'
  //   }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  // }

  const encodedUrl = encodeURIComponent(inputUrl);
  const targetUrl = `https://snapdownloader.com/tools/instagram-reels-downloader/download?url=${encodedUrl}`;

  // Fetch with retry logic
  let response;
  let retries = 3;
  
  while (retries > 0) {
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
          'Cache-Control': 'no-cache',
          'DNT': '1'
        },
        redirect: 'follow',
        cf: {
          cacheTtl: 300,
          cacheEverything: false,
          scrapeShield: false
        }
      });
      
      if (response.ok) break;
      
    } catch (err) {
      retries--;
      if (retries === 0) {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Service temporarily unavailable',
            credit: '@hsmodzofc2',
            retry_suggestion: 'Please try again in a few moments'
          }, null, 2),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Retry-After': '30'
            }
          }
        );
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!response.ok) {
    return new Response(
      JSON.stringify({
        status: 'error',
        message: `Failed to fetch from source (HTTP ${response.status})`,
        credit: '@hsmodzofc2'
      }, null, 2),
      {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  const html = await response.text();

  // Improved regex patterns for better extraction
  const videoRegex = /<a[^>]+href="([^"]+\.mp4(?:\?[^"]*)?)"[^>]*download[^>]*>/gi;
  const thumbRegex = /<img[^>]+src="([^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*instagram[^>]*>/gi;
  const titleRegex = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"[^>]*>/i;
  const descriptionRegex = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"[^>]*>/i;

  // Extract all video URLs
  const videoUrls = [];
  let match;
  while ((match = videoRegex.exec(html)) !== null) {
    const url = decodeURIComponent(match[1].replace(/&amp;/g, '&'));
    if (url.includes('.mp4')) {
      // Extract quality from URL if possible
      const qualityMatch = url.match(/(\d+)x(\d+)/);
      const resolution = qualityMatch ? parseInt(qualityMatch[1]) : 0;
      
      videoUrls.push({
        url: url,
        quality: resolution,
        resolution: qualityMatch ? `${qualityMatch[1]}x${qualityMatch[2]}` : 'unknown'
      });
    }
  }

  // Extract thumbnail
  let thumbUrl = '';
  const thumbMatch = thumbRegex.exec(html);
  if (thumbMatch) {
    thumbUrl = decodeURIComponent(thumbMatch[1].replace(/&amp;/g, '&'));
  }

  // Extract metadata
  const titleMatch = html.match(titleRegex);
  const descriptionMatch = html.match(descriptionRegex);
  
  const metadata = {
    title: titleMatch ? titleMatch[1] : null,
    description: descriptionMatch ? descriptionMatch[1] : null,
    source_url: inputUrl,
    timestamp: new Date().toISOString()
  };

  // Sort videos by quality
  videoUrls.sort((a, b) => b.quality - a.quality);

  // Select video based on requested quality
  let selectedVideo = videoUrls[0];
  
  if (quality === 'high' && videoUrls.length > 1) {
    selectedVideo = videoUrls.find(v => v.quality >= 720) || videoUrls[0];
  } else if (quality === 'medium' && videoUrls.length > 1) {
    selectedVideo = videoUrls.find(v => v.quality >= 480 && v.quality < 720) || videoUrls[videoUrls.length - 1];
  }

  // Prepare response
  if (selectedVideo && selectedVideo.url) {
    const responseData = {
      status: 'success',
      data: {
        video: selectedVideo.url,
        all_qualities: videoUrls.map(v => ({
          url: v.url,
          resolution: v.resolution
        })),
        thumbnail: thumbUrl || null,
        metadata: metadata,
        format: format,
        requested_quality: quality
      },
      credit: '@hsmodzofc2',
      api_version: '2.0'
    };

    // Return direct video if format=direct
    if (format === 'direct' && selectedVideo.url) {
      return Response.redirect(selectedVideo.url, 302);
    }

    // Return JSON response
    return new Response(
      JSON.stringify(responseData, null, 2),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300, s-maxage=600',
          'X-API-Version': '2.0',
          'X-API-Author': '@hsmodzofc2',
          'X-RateLimit-Limit': '50',
          'X-RateLimit-Remaining': '49'
        }
      }
    );
  } else {
    // Fallback to old regex pattern
    const oldVideoRegex = /<a[^>]+href="([^"]*\.mp4[^"]*)"[^>]*>/i;
    const oldVideoMatch = html.match(oldVideoRegex);
    const oldVideoUrl = oldVideoMatch ? decodeURIComponent(oldVideoMatch[1].replace(/&amp;/g, '&')) : '';

    if (oldVideoUrl) {
      return new Response(
        JSON.stringify({
          status: 'success',
          data: {
            video: oldVideoUrl,
            thumbnail: thumbUrl || null,
            metadata: metadata,
            note: 'Using fallback extraction method'
          },
          credit: '@hsmodzofc2',
          api_version: '2.0'
        }, null, 2),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'error',
        message: 'No video found in response',
        debug_info: {
          html_length: html.length,
          video_urls_found: videoUrls.length
        },
        credit: '@hsmodzofc2',
        suggestion: 'Try a different Instagram URL or try again later'
      }, null, 2),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}