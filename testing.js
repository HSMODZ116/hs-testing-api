// Made by Ashlynn Repository
// Hosted on Cloudflare Workers
// Repository: https://t.me/Ashlynn_Repository
// Magic Studio AI Art Generator API
const CUSTOM_HEADERS = {
  "X-Creator": "https://t.me/Ashlynn_Repository",
  "X-Powered-By": "Cloudflare Workers"
};

function generateClientId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateUUID() {
  return crypto.randomUUID();
}

function createFormData(prompt) {
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
  const parts = [];
  
  const fields = {
    prompt: prompt,
    output_format: "bytes",
    user_profile_id: "null",
    anonymous_user_id: generateUUID(),
    request_timestamp: (Date.now() / 1000).toFixed(3),
    user_is_subscribed: "false",
    client_id: generateClientId()
  };

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  parts.push(`--${boundary}--\r\n`);
  
  return {
    body: parts.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function scrapeImage(prompt) {
  const formData = createFormData(prompt);

  try {
    const response = await fetch(
      "https://ai-api.magicstudio.com/api/ai-art-generator",
      {
        method: "POST",
        headers: {
          "Content-Type": formData.contentType,
          "accept": "application/json, text/plain, */*",
          "origin": "https://magicstudio.com",
          "referer": "https://magicstudio.com/ai-art-generator/",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0"
        },
        body: formData.body
      }
    );

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("API Error:", error.message);
    throw new Error(`Failed to get response from API: ${error.message}`);
  }
}

function createImageResponse(buffer, filename = null) {
  const headers = {
    "Content-Type": "image/jpeg",
    "Content-Length": buffer.byteLength.toString(),
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    ...CUSTOM_HEADERS
  };

  if (filename) {
    headers["Content-Disposition"] = `inline; filename="${filename}"`;
  }

  return new Response(buffer, { headers, status: 200 });
}

function createErrorResponse(error, code = 400) {
  return new Response(
    JSON.stringify({
      status: false,
      error: error,
      code: code
    }),
    {
      status: code,
      headers: {
        "Content-Type": "application/json",
        ...CUSTOM_HEADERS
      }
    }
  );
}

async function handleGet(request) {
  const url = new URL(request.url);
  const prompt = url.searchParams.get("prompt");

  if (!prompt) {
    return createErrorResponse("Parameter 'prompt' is required", 400);
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return createErrorResponse("Parameter 'prompt' must be a non-empty string", 400);
  }

  if (prompt.length > 1000) {
    return createErrorResponse("Parameter 'prompt' must be less than 1000 characters", 400);
  }

  try {
    const result = await scrapeImage(prompt.trim());
    return createImageResponse(result);
  } catch (error) {
    return createErrorResponse(error.message || "Internal Server Error", 500);
  }
}

async function handlePost(request) {
  let body;
  
  try {
    body = await request.json();
  } catch (e) {
    return createErrorResponse("Invalid JSON in request body", 400);
  }

  const { prompt } = body || {};

  if (!prompt) {
    return createErrorResponse("Parameter 'prompt' is required", 400);
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return createErrorResponse("Parameter 'prompt' must be a non-empty string", 400);
  }

  if (prompt.length > 1000) {
    return createErrorResponse("Parameter 'prompt' must be less than 1000 characters", 400);
  }

  try {
    const result = await scrapeImage(prompt.trim());
    return createImageResponse(result);
  } catch (error) {
    return createErrorResponse(error.message || "Internal Server Error", 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/ai/magicstudio") {
      if (request.method === "GET") {
        return await handleGet(request);
      } else if (request.method === "POST") {
        return await handlePost(request);
      } else {
        return createErrorResponse("Method not allowed", 405);
      }
    }

    if (path === "/" || path === "") {
      return new Response(
        JSON.stringify({
          name: "Magic Studio AI Art Generator API",
          Creator: "Ashlynn Repository",
          version: "1.0.0",
          endpoints: [
            {
              method: "GET",
              path: "/api/ai/magicstudio",
              description: "Generate AI art from a text prompt using query parameters",
              parameters: {
                prompt: "Text prompt for AI art generation (required, max 1000 characters)"
              },
              example: "/api/ai/magicstudio?prompt=portrait%20of%20a%20wizard%20with%20a%20long%20beard"
            },
            {
              method: "POST",
              path: "/api/ai/magicstudio",
              description: "Generate AI art from a text prompt using JSON body",
              body: {
                prompt: "Text prompt for AI art generation (required, max 1000 characters)"
              },
              example: {
                prompt: "portrait of a wizard with a long beard"
              }
            }
          ]
        }, null, 2),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...CUSTOM_HEADERS
          }
        }
      );
    }

    // 404 for unknown routes
    return createErrorResponse("Not Found", 404);
  }
};