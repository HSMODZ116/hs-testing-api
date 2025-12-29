export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const prompt = url.searchParams.get("prompt");

      if (!prompt) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing parameter: prompt",
            usage: "?prompt=hello"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // ================== CONFIG ==================
      const BYTEZ_API_KEY = "6194145698eb0750c92a529a7f77f662";
      const MODEL_NAME = "free-ai-ltd/ja-aozora-wikipedia-gamma-2b-chat";
      const BYTEZ_API_URL = "https://api.bytez.com/v1/run";

      // ================== API CALL ==================
      const payload = {
        model: MODEL_NAME,
        input: prompt
      };

      const apiResponse = await fetch(BYTEZ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + BYTEZ_API_KEY
        },
        body: JSON.stringify(payload)
      });

      const data = await apiResponse.json();

      return new Response(
        JSON.stringify({
          success: true,
          model: MODEL_NAME,
          prompt: prompt,
          response: data
        }),
        {
          headers: { "Content-Type": "application/json" }
        }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err.message
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }
};