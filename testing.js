/**
 * ImagePromptGuru Stable API - Cloudflare Workers
 * ONLY working & safe features
 */

const BASE_URL = "https://api.imagepromptguru.net";

// --------- Utils ---------

function getCORSHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...getCORSHeaders()
    }
  });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function isValidImageUrl(url) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
}

// --------- Core API ---------

class ImagePromptGuru {
  constructor() {
    this.headers = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0"
    };
  }

  async imageToPrompt(imageUrl, lang = "en") {
    if (!isValidImageUrl(imageUrl)) {
      throw new Error("Invalid image URL");
    }

    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("Failed to download image");

    const type = imgRes.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      throw new Error("URL is not an image");
    }

    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error("Image too large (max 5MB)");
    }

    const base64 = arrayBufferToBase64(buffer);
    const payload = {
      image: `data:${type};base64,${base64}`,
      language: lang
    };

    const res = await fetch(`${BASE_URL}/image-to-prompt`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error("ImagePromptGuru API failed");
    }

    const data = await res.json();
    return data.prompt || data.result || data.text || "";
  }

  async textToPrompt(text, lang = "en") {
    if (!text || !text.trim()) {
      throw new Error("Text is required");
    }

    const payload = {
      text: text.trim(),
      language: lang
    };

    const res = await fetch(`${BASE_URL}/text-to-prompt`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error("ImagePromptGuru API failed");
    }

    const data = await res.json();
    return data.prompt || data.result || data.text || "";
  }
}

// --------- Worker ---------

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: getCORSHeaders() });
    }

    try {
      const url = new URL(req.url);
      const api = new ImagePromptGuru();

      // IMAGE → PROMPT
      if (url.pathname === "/image") {
        const imageUrl = url.searchParams.get("imageUrl");
        const lang = url.searchParams.get("lang") || "en";

        if (!imageUrl) {
          return json({ error: "imageUrl is required" }, 400);
        }

        const prompt = await api.imageToPrompt(imageUrl, lang);
        return json({
          success: true,
          type: "image",
          prompt,
          length: prompt.length
        });
      }

      // TEXT → PROMPT
      if (url.pathname === "/text") {
        const text = url.searchParams.get("text");
        const lang = url.searchParams.get("lang") || "en";

        if (!text) {
          return json({ error: "text is required" }, 400);
        }

        const prompt = await api.textToPrompt(text, lang);
        return json({
          success: true,
          type: "text",
          prompt,
          length: prompt.length
        });
      }

      return json({
        message: "ImagePromptGuru API",
        endpoints: {
          "/image?imageUrl=URL": "Image to Prompt",
          "/text?text=TEXT": "Text to Prompt"
        }
      });

    } catch (e) {
      return json({
        success: false,
        error: e.message
      }, 500);
    }
  }
};