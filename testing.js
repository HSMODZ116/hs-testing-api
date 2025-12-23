// index.js for Cloudflare Worker
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use GET with file_url parameter.' }),
        { 
          status: 405,
          headers: getHeaders()
        }
      );
    }

    try {
      // Get URL parameters
      const url = new URL(request.url);
      const fileUrl = url.searchParams.get('file_url');
      
      // Check if file_url parameter is provided
      if (!fileUrl) {
        return errorResponse('Missing required parameter: file_url. Example: ?file_url=https://example.com/script.js', 400);
      }

      // Validate URL format
      let parsedFileUrl;
      try {
        parsedFileUrl = new URL(fileUrl);
      } catch (e) {
        return errorResponse('Invalid URL format. Please provide a valid URL.', 400);
      }

      // Step 1: Download the JavaScript file from provided URL
      const { jsCode, originalFileName } = await downloadJavaScriptFile(fileUrl);
      if (!jsCode) {
        return errorResponse('Failed to download JavaScript file. Make sure the URL is accessible and contains a .js file.', 400);
      }

      // Step 2: Obfuscate the JavaScript code
      const obfuscatedCode = await obfuscateJavaScript(jsCode);
      if (!obfuscatedCode) {
        return errorResponse('Failed to obfuscate JavaScript code. Obfuscation service might be unavailable.', 500);
      }

      // Step 3: Upload the obfuscated file to your hosting service
      const fileUrlResponse = await uploadToHosting(obfuscatedCode, originalFileName);
      if (!fileUrlResponse) {
        return errorResponse('Failed to upload file to hosting service.', 500);
      }

      // Step 4: Get the final hosted URL
      const finalUrl = await getHostedUrl(fileUrlResponse, originalFileName);

      // Return success response with the URL
      return successResponse({
        success: true,
        message: 'File downloaded, obfuscated, and uploaded successfully',
        originalUrl: fileUrl,
        originalFilename: originalFileName,
        obfuscatedFileUrl: finalUrl,
        downloadLink: `<a href="${finalUrl}" target="_blank">${finalUrl}</a>`,
        timestamp: new Date().toISOString(),
        note: 'The obfuscated file is available for 24 hours'
      });

    } catch (error) {
      console.error('Error processing request:', error);
      return errorResponse(`Internal server error: ${error.message}`, 500);
    }
  }
};

// Function to download JavaScript file from URL
async function downloadJavaScriptFile(fileUrl) {
  try {
    const response = await fetch(fileUrl, {
      headers: {
        'User-Agent': 'Cloudflare-Worker-JS-Obfuscator/1.0'
      },
      cf: {
        // Cloudflare specific cache settings
        cacheTtl: 300,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('javascript') && !contentType.includes('text/plain')) {
      console.warn(`Downloaded file may not be JavaScript. Content-Type: ${contentType}`);
    }

    // Get filename from URL or response headers
    let fileName = 'script.js';
    
    // Try to get filename from Content-Disposition header
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
      if (filenameMatch && filenameMatch[1]) {
        fileName = filenameMatch[1];
      }
    }
    
    // If not found in headers, extract from URL
    if (fileName === 'script.js') {
      const urlPath = new URL(fileUrl).pathname;
      const urlFileName = urlPath.split('/').pop();
      if (urlFileName && urlFileName.includes('.js')) {
        fileName = urlFileName;
      } else if (urlFileName && urlFileName.includes('.')) {
        // Keep original extension
        fileName = urlFileName;
      } else {
        // Add .js extension if missing
        fileName = 'downloaded_script.js';
      }
    }

    // Read the file content
    const jsCode = await response.text();
    
    // Validate that it's actually JavaScript code
    if (jsCode.length === 0) {
      throw new Error('Downloaded file is empty');
    }

    // Basic JavaScript validation (optional)
    const isValidJS = validateJavaScript(jsCode);
    if (!isValidJS) {
      console.warn('Downloaded content may not be valid JavaScript');
    }

    return { jsCode, originalFileName: fileName };
  } catch (error) {
    console.error('Download error:', error);
    return { jsCode: null, originalFileName: null };
  }
}

// Basic JavaScript validation (simple check)
function validateJavaScript(code) {
  // Check if it contains common JavaScript patterns
  const jsPatterns = [
    /function\s+\w+\s*\(/i,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /console\.log/,
    /document\./,
    /window\./,
    /\.addEventListener/,
    /return\s+/,
    /if\s*\(/,
    /for\s*\(/,
    /while\s*\(/
  ];
  
  return jsPatterns.some(pattern => pattern.test(code)) || code.includes(';');
}

// Function to obfuscate JavaScript code using external API
async function obfuscateJavaScript(code) {
  try {
    // Encode the code for URL
    const encodedCode = encodeURIComponent(code);
    const obfuscateApiUrl = `https://api.deline.web.id/tools/enc?text=${encodedCode}`;
    
    const response = await fetch(obfuscateApiUrl, {
      headers: {
        'User-Agent': 'Cloudflare-Worker-Obfuscator/1.0',
        'Accept': 'application/json'
      },
      cf: {
        cacheTtl: 60,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      throw new Error(`Obfuscation API failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status === true && data.result) {
      return data.result;
    } else {
      throw new Error('Invalid response from obfuscation API');
    }
  } catch (error) {
    console.error('Obfuscation error:', error);
    return null;
  }
}

// Function to upload obfuscated code to your hosting service
async function uploadToHosting(obfuscatedCode, originalFileName) {
  try {
    // Create a FormData object for the upload
    const formData = new FormData();
    
    // Create a blob from the obfuscated code
    const blob = new Blob([obfuscatedCode], { type: 'application/javascript' });
    
    // Generate a new filename with timestamp
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const newFileName = `obfuscated_${timestamp}_${randomId}_${originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    
    // Append the file to FormData
    formData.append('file', blob, newFileName);
    
    // Upload to your hosting service
    const uploadResponse = await fetch('https://hosting.haseeb-sahil.workers.dev/upload', {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Upload failed with status: ${uploadResponse.status}`);
    }

    return await uploadResponse.json();
  } catch (error) {
    console.error('Upload error:', error);
    return null;
  }
}

// Function to get the final hosted URL
async function getHostedUrl(uploadResponse, originalFileName) {
  try {
    // If upload service returns a direct URL
    if (uploadResponse.url) {
      return uploadResponse.url;
    }
    
    // If upload service returns a file ID or name
    if (uploadResponse.fileId || uploadResponse.name) {
      const fileId = uploadResponse.fileId || uploadResponse.name;
      return `https://hosting.haseeb-sahil.workers.dev/${fileId}`;
    }
    
    // Try to fetch from the URL API
    const urlResponse = await fetch('https://hosting.haseeb-sahil.workers.dev/hosturl');
    if (urlResponse.ok) {
      const urlData = await urlResponse.json();
      if (urlData.url) {
        return urlData.url;
      }
    }
    
    // Fallback: construct URL based on filename pattern
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const safeFileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `https://hosting.haseeb-sahil.workers.dev/obfuscated_${timestamp}_${randomId}_${safeFileName}`;
    
  } catch (error) {
    console.error('Error getting hosted URL:', error);
    return 'https://hosting.haseeb-sahil.workers.dev/obfuscated_file.js';
  }
}

// Helper function for success responses
function successResponse(data) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: 200,
      headers: getHeaders()
    }
  );
}

// Helper function for error responses
function errorResponse(message, statusCode = 500) {
  return new Response(
    JSON.stringify({ 
      success: false, 
      error: message,
      timestamp: new Date().toISOString()
    }, null, 2),
    {
      status: statusCode,
      headers: getHeaders()
    }
  );
}

// Get common headers
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };
}

// Handle CORS preflight requests
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}