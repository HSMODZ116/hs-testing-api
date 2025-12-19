/**
 * Complete ImagePromptGuru API - Cloudflare Workers
 * Supports both Image to Prompt and Text to Prompt
 * Made for hs-testing-api.deno.dev
 */

class CompletePromptAPI {
  constructor() {
    this.baseUrl = "https://api.imagepromptguru.net";
    this.defaultHeaders = {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/json",
      "origin": "https://imagepromptguru.net",
      "pragma": "no-cache",
      "priority": "u=1, i",
      "referer": "https://imagepromptguru.net/",
      "sec-ch-ua": '"Chromium";v="120", "Not A(Brand";v="99", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    
    // Supported models from website
    this.supportedModels = ['general', 'midjourney', 'dalle', 'stable_diffusion', 'flux'];
    
    // Supported styles from website
    this.supportedStyles = [
      'general', 'photorealistic', 'ghibli', 'cyberpunk', 
      'fantasy', 'anime', 'watercolor', 'oil_painting', 'steampunk'
    ];
    
    // Supported languages
    this.supportedLanguages = [
      'en', 'es', 'zh', 'zh-TW', 'fr', 'de', 'ja', 'ru', 
      'pt', 'ar', 'ko', 'it', 'nl', 'tr', 'pl', 'vi', 'th', 'hi', 'id'
    ];
  }

  /**
   * Validates image URL
   */
  isValidImageUrl(url) {
    try {
      const urlObj = new URL(url);
      const validProtocols = ['http:', 'https:'];
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
      
      if (!validProtocols.includes(urlObj.protocol)) {
        return false;
      }
      
      const pathname = urlObj.pathname.toLowerCase();
      return validExtensions.some(ext => pathname.endsWith(ext));
    } catch {
      return false;
    }
  }

  /**
   * Downloads image and converts to base64
   */
  async downloadImageAsBase64(imageUrl) {
    try {
      const response = await fetch(imageUrl, {
        headers: { 'User-Agent': this.defaultHeaders['user-agent'] },
        cf: { cacheTtl: 60 } // Cache for 60 seconds
      });

      if (!response.ok) {
        throw new Error(`Image download failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      
      if (!contentType || !validImageTypes.some(type => contentType.startsWith(type))) {
        throw new Error(`Invalid image type: ${contentType || 'unknown'}. Supported: JPEG, PNG, WEBP, GIF`);
      }

      const contentLength = response.headers.get('content-length');
      const maxSize = 5 * 1024 * 1024; // 5MB
      
      if (contentLength && parseInt(contentLength) > maxSize) {
        throw new Error(`Image too large: ${Math.round(contentLength / 1024 / 1024)}MB. Max 5MB allowed.`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        base64Data,
        mimeType: contentType,
        size: contentLength ? parseInt(contentLength) : arrayBuffer.byteLength
      };
    } catch (error) {
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Image to Prompt API
   */
  async getImagePrompt({ imageUrl, model = "general", lang = "en" }) {
    if (!imageUrl) throw new Error("imageUrl is required");
    
    if (!this.isValidImageUrl(imageUrl)) {
      throw new Error("Invalid image URL. Please provide a valid URL ending with .jpg, .jpeg, .png, .webp or .gif");
    }

    if (!this.supportedModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}. Supported: ${this.supportedModels.join(', ')}`);
    }

    if (!this.supportedLanguages.includes(lang)) {
      throw new Error(`Unsupported language: ${lang}. Supported: ${this.supportedLanguages.join(', ')}`);
    }

    const { base64Data, mimeType } = await this.downloadImageAsBase64(imageUrl);
    const imageDataUri = `data:${mimeType};base64,${base64Data}`;

    const payload = { 
      image: imageDataUri, 
      model, 
      language: lang 
    };
    
    const response = await fetch(`${this.baseUrl}/image-to-prompt`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || 'Unknown error' };
      }
      throw new Error(`Image API failed: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    
    // Standardize response format
    return {
      success: true,
      prompt: data.prompt || data.result || data.text || '',
      model: model,
      language: lang,
      details: data
    };
  }

  /**
   * Text to Prompt API
   */
  async getTextPrompt({ text, model = "general", lang = "en", style = "general" }) {
    if (!text?.trim()) throw new Error("text is required");
    
    if (!this.supportedModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}. Supported: ${this.supportedModels.join(', ')}`);
    }

    if (!this.supportedLanguages.includes(lang)) {
      throw new Error(`Unsupported language: ${lang}. Supported: ${this.supportedLanguages.join(', ')}`);
    }

    if (!this.supportedStyles.includes(style)) {
      throw new Error(`Unsupported style: ${style}. Supported: ${this.supportedStyles.join(', ')}`);
    }

    const payload = { 
      text: text.trim(),
      model,
      language: lang,
      style
    };
    
    const response = await fetch(`${this.baseUrl}/text-to-prompt`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText || 'Unknown error' };
      }
      throw new Error(`Text API failed: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    
    // Standardize response format
    return {
      success: true,
      prompt: data.prompt || data.result || data.text || '',
      model: model,
      language: lang,
      style: style,
      details: data
    };
  }

  /**
   * Get API status
   */
  async getStatus() {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': this.defaultHeaders['user-agent'] }
      });
      
      return {
        status: 'online',
        baseUrl: this.baseUrl,
        timestamp: new Date().toISOString(),
        supportedFeatures: {
          imageToPrompt: true,
          textToPrompt: true,
          models: this.supportedModels,
          styles: this.supportedStyles,
          languages: this.supportedLanguages
        }
      };
    } catch (error) {
      return {
        status: 'offline',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Helper functions
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  };
}

function handleCORSPreflight(request) {
  return new Response(null, { 
    status: 204, 
    headers: getCORSHeaders() 
  });
}

function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCORSHeaders(),
      ...additionalHeaders
    }
  });
}

function errorResponse(message, status = 400, details = {}) {
  return jsonResponse({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    ...details
  }, status);
}

async function extractParams(request) {
  const url = new URL(request.url);
  const endpoint = url.pathname.split('/').filter(Boolean)[0] || 'api';
  
  if (request.method === 'GET') {
    const params = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return { endpoint, ...params };
  } else if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await request.json();
        return { endpoint, ...body };
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        const body = {};
        for (const [key, value] of formData.entries()) {
          body[key] = value;
        }
        return { endpoint, ...body };
      } else if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const body = {};
        for (const [key, value] of formData.entries()) {
          body[key] = value instanceof File ? {
            name: value.name,
            type: value.type,
            size: value.size,
            content: await value.text()
          } : value;
        }
        return { endpoint, ...body };
      }
      throw new Error('Unsupported content type');
    } catch (error) {
      throw new Error(`Invalid request body: ${error.message}`);
    }
  }
  
  throw new Error('Method not allowed');
}

// Rate limiting
class RateLimiter {
  constructor(limit = 100, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  check(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Clean old entries
    for (const [key, timestamp] of this.hits.entries()) {
      if (timestamp < windowStart) {
        this.hits.delete(key);
      }
    }
    
    const hitsInWindow = Array.from(this.hits.values())
      .filter(timestamp => timestamp >= windowStart)
      .length;
    
    if (hitsInWindow >= this.limit) {
      return false;
    }
    
    this.hits.set(ip, now);
    return true;
  }

  remaining(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const hitsInWindow = Array.from(this.hits.values())
      .filter(timestamp => timestamp >= windowStart)
      .length;
    
    return Math.max(0, this.limit - hitsInWindow);
  }
}

const rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

// Main handler
export default {
  async fetch(request, env, ctx) {
    try {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return handleCORSPreflight(request);
      }

      // Get client IP for rate limiting
      const clientIP = request.headers.get('cf-connecting-ip') || 
                      request.headers.get('x-forwarded-for') || 
                      'unknown';
      
      // Apply rate limiting
      if (!rateLimiter.check(clientIP)) {
        return errorResponse(
          'Rate limit exceeded. Please try again later.',
          429,
          { retryAfter: 60, remaining: 0 }
        );
      }

      const url = new URL(request.url);
      const api = new CompletePromptAPI();
      
      // Root endpoint - API documentation
      if (url.pathname === '/' || url.pathname === '/api' || url.pathname === '') {
        return jsonResponse({
          message: 'ImagePromptGuru API',
          version: '1.0.0',
          endpoints: {
            '/image': 'Image to Prompt (GET/POST)',
            '/text': 'Text to Prompt (GET/POST)',
            '/status': 'API Status (GET)',
            '/models': 'List supported models (GET)',
            '/languages': 'List supported languages (GET)',
            '/styles': 'List supported styles (GET)'
          },
          usage: {
            image: 'GET /image?imageUrl=URL&model=general&lang=en',
            text: 'GET /text?text=YOUR_TEXT&model=general&lang=en&style=general',
            post: 'POST with JSON body { "imageUrl": "...", "text": "...", "model": "...", "lang": "...", "style": "..." }'
          },
          rateLimit: {
            limit: 100,
            window: '60 seconds',
            remaining: rateLimiter.remaining(clientIP)
          },
          timestamp: new Date().toISOString()
        });
      }

      // Status endpoint
      if (url.pathname === '/status') {
        const status = await api.getStatus();
        return jsonResponse(status);
      }

      // Models endpoint
      if (url.pathname === '/models') {
        return jsonResponse({
          models: api.supportedModels,
          default: 'general',
          timestamp: new Date().toISOString()
        });
      }

      // Languages endpoint
      if (url.pathname === '/languages') {
        return jsonResponse({
          languages: api.supportedLanguages,
          default: 'en',
          timestamp: new Date().toISOString()
        });
      }

      // Styles endpoint
      if (url.pathname === '/styles') {
        return jsonResponse({
          styles: api.supportedStyles,
          default: 'general',
          timestamp: new Date().toISOString()
        });
      }

      // Image to Prompt endpoint
      if (url.pathname === '/image' || url.pathname === '/image-to-prompt') {
        if (!['GET', 'POST'].includes(request.method)) {
          return errorResponse('Method not allowed. Use GET or POST.', 405);
        }

        const params = await extractParams(request);
        
        if (!params.imageUrl && !params.image) {
          return errorResponse('Missing required parameter: imageUrl or image', 400, {
            required: ['imageUrl'],
            optional: ['model', 'lang'],
            example: '?imageUrl=https://example.com/image.jpg&model=midjourney&lang=en'
          });
        }

        const imageUrl = params.imageUrl || params.image;
        const model = params.model || 'general';
        const lang = params.lang || 'en';

        try {
          const result = await api.getImagePrompt({ imageUrl, model, lang });
          
          return jsonResponse({
            success: true,
            data: {
              prompt: result.prompt,
              model: result.model,
              language: result.language,
              length: result.prompt.length,
              timestamp: new Date().toISOString()
            },
            metadata: {
              endpoint: 'image-to-prompt',
              processingTime: result.details.processingTime || 'unknown',
              rateLimit: {
                remaining: rateLimiter.remaining(clientIP),
                resetIn: 60
              }
            }
          });
        } catch (error) {
          console.error('Image processing error:', error);
          return errorResponse(error.message, 400);
        }
      }

      // Text to Prompt endpoint
      if (url.pathname === '/text' || url.pathname === '/text-to-prompt') {
        if (!['GET', 'POST'].includes(request.method)) {
          return errorResponse('Method not allowed. Use GET or POST.', 405);
        }

        const params = await extractParams(request);
        
        if (!params.text && !params.prompt) {
          return errorResponse('Missing required parameter: text', 400, {
            required: ['text'],
            optional: ['model', 'lang', 'style'],
            example: '?text=a beautiful sunset&style=ghibli&lang=ja'
          });
        }

        const text = params.text || params.prompt;
        const model = params.model || 'general';
        const lang = params.lang || 'en';
        const style = params.style || 'general';

        try {
          const result = await api.getTextPrompt({ text, model, lang, style });
          
          return jsonResponse({
            success: true,
            data: {
              prompt: result.prompt,
              model: result.model,
              language: result.language,
              style: result.style,
              length: result.prompt.length,
              timestamp: new Date().toISOString()
            },
            metadata: {
              endpoint: 'text-to-prompt',
              processingTime: result.details.processingTime || 'unknown',
              rateLimit: {
                remaining: rateLimiter.remaining(clientIP),
                resetIn: 60
              }
            }
          });
        } catch (error) {
          console.error('Text processing error:', error);
          return errorResponse(error.message, 400);
        }
      }

      // Batch processing endpoint
      if (url.pathname === '/batch') {
        if (request.method !== 'POST') {
          return errorResponse('Method not allowed. Use POST.', 405);
        }

        const body = await request.json();
        
        if (!Array.isArray(body.requests)) {
          return errorResponse('Missing or invalid "requests" array in body', 400);
        }

        if (body.requests.length > 10) {
          return errorResponse('Maximum 10 requests per batch', 400);
        }

        const results = [];
        for (const req of body.requests) {
          try {
            if (req.type === 'image') {
              const result = await api.getImagePrompt(req);
              results.push({ success: true, type: 'image', data: result });
            } else if (req.type === 'text') {
              const result = await api.getTextPrompt(req);
              results.push({ success: true, type: 'text', data: result });
            } else {
              results.push({ success: false, error: 'Invalid request type' });
            }
          } catch (error) {
            results.push({ success: false, error: error.message });
          }
        }

        return jsonResponse({
          success: true,
          batchId: Date.now().toString(36),
          processed: results.length,
          results,
          timestamp: new Date().toISOString()
        });
      }

      // 404 - Endpoint not found
      return errorResponse(
        'Endpoint not found. Available endpoints: /image, /text, /status, /models, /languages, /styles',
        404
      );

    } catch (error) {
      console.error('Global error:', error);
      
      return errorResponse(
        'Internal server error',
        500,
        { 
          message: error.message,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID()
        }
      );
    }
  }
};