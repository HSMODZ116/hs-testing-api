/**
 * Cloudflare Workers Image Prompt API
 * Converts image URLs to AI-generated prompts using ImagePromptGuru API
 * Made by Ashlynn Repository
 */

class ImagePromptAPI {
  constructor() {
    this.apiUrl = "https://api.imagepromptguru.net/image-to-prompt";
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
   * @param {string} url - The URL to validate
   * @returns {boolean} - True if valid, false otherwise
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
   * @param {string} imageUrl - The image URL to download
   * @returns {Promise<{base64Data: string, mimeType: string}>}
   */
  async downloadImageAsBase64(imageUrl) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': this.defaultHeaders['user-agent']
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download image. Status: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`URL does not point to an image. Content-Type: ${contentType || 'unknown'}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      return {
        base64Data,
        mimeType: contentType
      };
    } catch (error) {
      throw new Error(`Image download failed: ${error.message}`);
    }
  }

  /**
   * Generates prompt from image
   * @param {Object} options - Configuration options
   * @param {string} options.imageUrl - URL of the image to process
   * @param {string} [options.model='general'] - Model to use for prompt generation
   * @param {string} [options.lang='en'] - Language for the generated prompt
   * @returns {Promise<Object>} - API response with generated prompt
   */
  async getPrompt({ imageUrl, model = "general", lang = "en" }) {
    if (!imageUrl) {
      throw new Error("imageUrl is required");
    }

    if (!this.isValidImageUrl(imageUrl)) {
      throw new Error("Invalid image URL provided");
    }

    const { base64Data, mimeType } = await this.downloadImageAsBase64(imageUrl);
    const imageDataUri = `data:${mimeType};base64,${base64Data}`;

    const payload = {
      image: imageDataUri,
      model: model,
      language: lang
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.message.includes('API request failed')) {
        throw error;
      }
      throw new Error(`ImagePromptGuru API Error: ${error.message}`);
    }
  }
}

/**
 * Gets CORS headers object
 * @returns {Object} - CORS headers
 */
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

/**
 * Handles CORS preflight requests
 * @param {Request} request - The incoming request
 * @returns {Response} - CORS response
 */
function handleCORSPreflight(request) {
  return new Response(null, { 
    status: 200, 
    headers: getCORSHeaders() 
  });
}

/**
 * Creates a JSON response with proper headers
 * @param {Object} data - Response data
 * @param {number} [status=200] - HTTP status code
 * @param {Object} [additionalHeaders={}] - Additional headers
 * @returns {Response} - JSON response
 */
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

/**
 * Extracts parameters from request (GET query params or POST body)
 * @param {Request} request - The incoming request
 * @returns {Promise<Object>} - Extracted parameters
 */
async function extractParams(request) {
  const url = new URL(request.url);
  
  if (request.method === 'GET') {
    return {
      imageUrl: url.searchParams.get('imageUrl'),
      model: url.searchParams.get('model') || 'general',
      lang: url.searchParams.get('lang') || 'en'
    };
  } else if (request.method === 'POST') {
    try {
      const body = await request.json();
      return {
        imageUrl: body.imageUrl,
        model: body.model || 'general',
        lang: body.lang || 'en'
      };
    } catch {
      throw new Error('Invalid JSON in request body');
    }
  }
  
  throw new Error('Method not allowed');
}

/**
 * Main request handler for Cloudflare Workers
 * @param {Request} request - The incoming request
 * @param {Object} env - Environment variables
 * @param {Object} ctx - Execution context
 * @returns {Promise<Response>} - HTTP response
 */
export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === 'OPTIONS') {
        return handleCORSPreflight(request);
      }

      // Only allow GET and POST methods
      if (!['GET', 'POST'].includes(request.method)) {
        return jsonResponse(
          { 
            error: 'Method not allowed',
            message: 'Only GET and POST methods are supported'
          }, 
          405
        );
      }

      const params = await extractParams(request);

      if (!params.imageUrl) {
        return jsonResponse(
          {
            error: 'Missing required parameter',
            message: 'imageUrl parameter is required'
          },
          400
        );
      }

      const validModels = ['general'];
      const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'];

      if (params.model && !validModels.includes(params.model)) {
        return jsonResponse(
          {
            error: 'Invalid model parameter',
            message: `Model must be one of: ${validModels.join(', ')}`,
            validModels
          },
          400
        );
      }

      if (params.lang && !validLanguages.includes(params.lang)) {
        return jsonResponse(
          {
            error: 'Invalid language parameter',
            message: `Language must be one of: ${validLanguages.join(', ')}`,
            validLanguages
          },
          400
        );
      }

      const api = new ImagePromptAPI();
      const result = await api.getPrompt(params);

      return jsonResponse({
        success: true,
        data: result,
        parameters: {
          imageUrl: params.imageUrl,
          model: params.model,
          language: params.lang
        }
      });

    } catch (error) {
      console.error('Error processing request:', error);
      
      let status = 500;
      if (error.message.includes('required') || 
          error.message.includes('Invalid') || 
          error.message.includes('download failed')) {
        status = 400;
      } else if (error.message.includes('API request failed')) {
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