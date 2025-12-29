export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      let prompt = url.searchParams.get("prompt");

      // POST JSON support
      if (!prompt && request.method === "POST") {
        try {
          const jsonBody = await request.json();
          prompt = jsonBody.prompt;
        } catch {
          // ignore JSON parse errors
        }
      }

      if (!prompt) {
        return new Response(JSON.stringify({
          success: false,
          error: "Missing required parameter: prompt",
          usage: "?prompt=Your text here"
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      // ================== CONFIG ==================
      const BYTEZ_KEY = "6194145698eb0750c92a529a7f77f662"; // 🔐 Replace with your key
      const BYTEZ_MODEL = "stable-diffusion-v1-5/stable-diffusion-v1-5";
      const BYTEZ_URL = `https://api.bytez.com/models/v2/${BYTEZ_MODEL}`;

      // ================== API CALL ==================
      const apiResponse = await fetch(BYTEZ_URL, {
        method: "POST",
        headers: {
          "Authorization": BYTEZ_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: prompt })
      });

      const status = apiResponse.status;
      const text = await apiResponse.text();

      if (status !== 200) {
        return new Response(JSON.stringify({
          success: false,
          error: "Image generation failed",
          details: text
        }), {
          status: status,
          headers: { "Content-Type": "application/json" }
        });
      }

      const data = JSON.parse(text);

      return new Response(JSON.stringify({
        success: true,
        prompt: prompt,
        image_url: data.output
      }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};