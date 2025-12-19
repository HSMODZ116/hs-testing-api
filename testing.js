/**
 * Complete ImagePromptGuru API - Cloudflare Workers
 * Supports both Image to Prompt and Text to Prompt
 * Developer: Haseeb Sahil
 * Made for hs-testing-api.deno.dev
 */

class CompletePromptAPI {
  constructor() {
    this.baseUrl = "https://api.imagepromptguru.net";
    this.defaultHeaders = {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      "origin": "https://imagepromptguru.net",
      "referer": "https://imagepromptguru.net/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    
    // Working models
    this.supportedModels = ['general', 'midjourney', 'dalle', 'stable_diffusion', 'flux'];
    
    // Working styles
    this.supportedStyles = [
      'general', 'photorealistic', 'ghibli', 'cyberpunk', 
      'fantasy', 'anime', 'watercolor', 'oil_painting', 'steampunk'
    ];
    
    // Working languages
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
        headers: { 'User-Agent': this.defaultHeaders['user-agent'] }
      });

      if (!response.ok) {
        throw new Error(`Image download failed: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      
      if (!contentType || !validImageTypes.some(type => contentType.startsWith(type))) {
        throw new Error(`Invalid image type: ${contentType || 'unknown'}. Supported: JPEG, PNG, WEBP, GIF`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        base64Data,
        mimeType: contentType,
        size: arrayBuffer.byteLength
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
      throw new Error(`API failed: ${response.status}`);
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
      throw new Error(`API failed: ${response.status}`);
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
        status: response.ok ? 'online' : 'offline',
        baseUrl: this.baseUrl,
        timestamp: new Date().toISOString(),
        developer: "Haseeb Sahil",
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
        timestamp: new Date().toISOString(),
        developer: "Haseeb Sahil"
      };
    }
  }
}

// Helper functions
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function handleCORSPreflight(request) {
  return new Response(null, { 
    status: 204, 
    headers: getCORSHeaders() 
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCORSHeaders()
    }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    developer: "Haseeb Sahil"
  }, status);
}

async function extractParams(request) {
  const url = new URL(request.url);
  
  if (request.method === 'GET') {
    const params = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } else if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await request.json();
      }
      throw new Error('Unsupported content type. Use application/json');
    } catch (error) {
      throw new Error(`Invalid request body: ${error.message}`);
    }
  }
  
  throw new Error('Method not allowed');
}

// Simple rate limiting
const requestCounts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip);
  
  // Clean old requests
  const recentRequests = requests.filter(time => time > windowStart);
  requestCounts.set(ip, recentRequests);
  
  // Check limit (100 requests per minute)
  if (recentRequests.length >= 100) {
    return false;
  }
  
  recentRequests.push(now);
  return true;
}

// Main handler
export default {
  async fetch(request, env, ctx) {
    try {
      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return handleCORSPreflight(request);
      }

      // Get client IP
      const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';
      
      // Apply rate limiting
      if (!checkRateLimit(clientIP)) {
        return errorResponse(
          'Rate limit exceeded. Please try again later.',
          429
        );
      }

      const url = new URL(request.url);
      const api = new CompletePromptAPI();
      
      // Root endpoint - API documentation
      if (url.pathname === '/' || url.pathname === '/api' || url.pathname === '') {
        return jsonResponse({
          message: 'ImagePromptGuru API',
          version: '1.0.0',
          developer: 'Haseeb Sahil',
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
          developer: 'Haseeb Sahil',
          timestamp: new Date().toISOString()
        });
      }

      // Languages endpoint
      if (url.pathname === '/languages') {
        return jsonResponse({
          languages: api.supportedLanguages,
          default: 'en',
          developer: 'Haseeb Sahil',
          timestamp: new Date().toISOString()
        });
      }

      // Styles endpoint
      if (url.pathname === '/styles') {
        return jsonResponse({
          styles: api.supportedStyles,
          default: 'general',
          developer: 'Haseeb Sahil',
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
          return errorResponse('Missing required parameter: imageUrl', 400);
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
            developer: 'Haseeb Sahil'
          });
        } catch (error) {
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
          return errorResponse('Missing required parameter: text', 400);
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
            developer: 'Haseeb Sahil'
          });
        } catch (error) {
          return errorResponse(error.message, 400);
        }
      }

      // 404 - Endpoint not found
      return errorResponse(
        'Endpoint not found. Available: /image, /text, /status, /models, /languages, /styles',
        404
      );

    } catch (error) {
      return errorResponse(
        'Internal server error',
        500
      );
    }
  }
};