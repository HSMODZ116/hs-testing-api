/**
 * Cloudflare Workers Image & Text Prompt API
 * Converts image/text to AI-generated prompts using ImagePromptGuru API
 * Made by Ashlynn Repository
 */

class PromptGuruAPI {
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
  }

  /**
   * Validates if the provided URL is a valid image URL
   */
  isValidImageUrl(url) {
    try {
      const urlObj = new URL(url);
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Downloads and converts image to base64
   */
  async downloadImageAsBase64(imageUrl) {
    try {
      const response = await fetch(imageUrl, {
        headers: { 'User-Agent': this.defaultHeaders['user-agent'] }
      });

      if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
      
      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        throw new Error(`URL does not point to an image. Content-Type: ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return { base64Data, mimeType: contentType };
    } catch (error) {
      throw new Error(`Image download failed: ${error.message}`);
    }
  }

  /**
   * Generates prompt from image
   */
  async getImagePrompt({ imageUrl, model = "general", lang = "en" }) {
    if (!imageUrl) throw new Error("imageUrl is required");
    if (!this.isValidImageUrl(imageUrl)) throw new Error("Invalid image URL");

    const { base64Data, mimeType } = await this.downloadImageAsBase64(imageUrl);
    const imageDataUri = `data:${mimeType};base64,${base64Data}`;

    const payload = { image: imageDataUri, model, language: lang };
    
    const response = await fetch(`${this.baseUrl}/image-to-prompt`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Image API failed: ${response.status} - ${errorData}`);
    }

    return await response.json();
  }

  /**
   * Generates prompt from text
   */
  async getTextPrompt({ text, model = "general", lang = "en" }) {
    if (!text?.trim()) throw new Error("text is required");
    
    const payload = { 
      text: text.trim(), 
      model, 
      language: lang 
    };
    
    const response = await fetch(`${this.baseUrl}/text-to-prompt`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Text API failed: ${response.status} - ${errorData}`);
    }

    return await response.json();
  }
}

// CORS and helper functions (same as before)
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function handleCORSPreflight(request) {
  return new Response(null, { status: 200, headers: getCORSHeaders() });
}

function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCORSHeaders(),
      ...additionalHeaders
    }
  });
}

async function extractParams(request) {
  const url = new URL(request.url);
  const endpoint = url.pathname.replace('/', '') || 'image'; // 'image' or 'text'
  
  if (request.method === 'GET') {
    return {
      endpoint,
      imageUrl: url.searchParams.get('imageUrl'),
      text: url.searchParams.get('text'),
      model: url.searchParams.get('model') || 'general',
      lang: url.searchParams.get('lang') || 'en'
    };
  } else if (request.method === 'POST') {
    try {
      const body = await request.json();
      return {
        endpoint,
        imageUrl: body.imageUrl,
        text: body.text,
        model: body.model || 'general',
        lang: body.lang || 'en'
      };
    } catch {
      throw new Error('Invalid JSON in request body');
    }
  }
  
  throw new Error('Method not allowed');
}

// Main handler
export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === 'OPTIONS') return handleCORSPreflight(request);
      if (!['GET', 'POST'].includes(request.method)) {
        return jsonResponse({ 
          error: 'Method not allowed',
          message: 'Only GET and POST methods are supported'
        }, 405);
      }

      const params = await extractParams(request);
      const api = new PromptGuruAPI();
      
      // Determine endpoint
      let result;
      if (params.endpoint === 'text' || params.text) {
        // Text to Prompt
        if (!params.text) {
          return jsonResponse({
            error: 'Missing required parameter',
            message: 'text parameter is required for text-to-prompt'
          }, 400);
        }
        result = await api.getTextPrompt({
          text: params.text,
          model: params.model,
          lang: params.lang
        });
      } else {
        // Image to Prompt (default)
        if (!params.imageUrl) {
          return jsonResponse({
            error: 'Missing required parameter',
            message: 'imageUrl parameter is required for image-to-prompt'
          }, 400);
        }
        result = await api.getImagePrompt({
          imageUrl: params.imageUrl,
          model: params.model,
          lang: params.lang
        });
      }

      return jsonResponse({
        success: true,
        endpoint: params.endpoint,
        data: result,
        parameters: {
          imageUrl: params.imageUrl,
          text: params.text,
          model: params.model,
          language: params.lang
        }
      });

    } catch (error) {
      console.error('Error:', error);
      
      let status = 500;
      if (error.message.includes('required') || 
          error.message.includes('Invalid') || 
          error.message.includes('download failed')) {
        status = 400;
      } else if (error.message.includes('API failed')) {
        status = 502;
      }

      return jsonResponse(
        {
          error: 'Request failed',
          message: error.message,
          timestamp: new Date().toISOString()
        },
        status
      );
    }
  }
};