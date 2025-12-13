// Cloudflare Worker Rate-Limited Proxy
export default {
  async fetch(request, env, ctx) {
    // ==== CONFIGURATION ====
    const RATE_LIMIT = 5;           // Max requests
    const RATE_WINDOW = 60;         // In seconds
    
    const url = new URL(request.url);
    
    // ==== RATE LIMIT CHECK ====
    const clientIP = request.headers.get('cf-connecting-ip') || 
                     request.headers.get('x-forwarded-for') || 
                     'unknown-ip';
    
    // Create a unique key for this IP
    const rateKey = `rate_limit_${clientIP}`;
    
    // Get existing access log from KV namespace (you'll need to create this in Cloudflare dashboard)
    let accessLog = [];
    try {
      const storedLog = await env.RATE_LIMIT_KV.get(rateKey);
      if (storedLog) {
        accessLog = JSON.parse(storedLog);
      }
    } catch (e) {
      // If KV not configured, continue without rate limiting
      console.log('KV not configured, rate limiting disabled');
    }
    
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    
    // Filter out old timestamps
    accessLog = accessLog.filter(timestamp => {
      return (timestamp + RATE_WINDOW) >= now;
    });
    
    // Check if rate limit exceeded
    if (accessLog.length >= RATE_LIMIT && env.RATE_LIMIT_KV) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    
    // Log current request (only if KV is configured)
    if (env.RATE_LIMIT_KV) {
      accessLog.push(now);
      // Store only the most recent RATE_LIMIT * 2 entries to prevent unbounded growth
      if (accessLog.length > RATE_LIMIT * 2) {
        accessLog = accessLog.slice(-RATE_LIMIT);
      }
      
      // Store with expiration to automatically clean up
      await env.RATE_LIMIT_KV.put(
        rateKey, 
        JSON.stringify(accessLog),
        { expirationTtl: RATE_WINDOW * 2 }
      );
    }
    
    // ==== VALIDATION ====
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    
    // ==== BUILD API CALL ====
    const encodedUrl = encodeURIComponent(targetUrl);
    const apiUrl = `https://utdqxiuahh.execute-api.ap-south-1.amazonaws.com/pro/fetch?url=${encodedUrl}&user_id=h2`;
    
    const headers = {
      "x-api-key": "fAtAyM17qm9pYmsaPlkAT8tRrDoHICBb2NnxcBPM",
      "User-Agent": "okhttp/4.12.0",
      "Accept-Encoding": "gzip",
      "Accept": "application/json"
    };
    
    // ==== MAKE REQUEST ====
    try {
      const response = await fetch(apiUrl, {
        headers: headers,
        cf: {
          // Cloudflare-specific options
          cacheEverything: false,
          cacheTtl: 0
        }
      });
      
      // Check if response is successful
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      // Get the response data
      const responseData = await response.text();
      
      // ==== RETURN RESULT ====
      return new Response(responseData, {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Enable CORS if needed
          "Cache-Control": "no-store, max-age=0"
        }
      });
      
    } catch (error) {
      // ==== ERROR HANDLING ====
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch from API", 
          details: error.message 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};