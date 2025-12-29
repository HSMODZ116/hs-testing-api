export default {
  async fetch(request) {
    const url = new URL(request.url);
    const prompt = url.searchParams.get("prompt");

    if (!prompt) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing prompt"
      }), { headers: { "Content-Type": "application/json" } });
    }

    const BYTEZ_API_KEY = "6194145698eb0750c92a529a7f77f662";
    const MODEL_NAME = "free-ai-ltd/ja-aozora-wikipedia-gamma-2b-chat";

    const res = await fetch("https://api.bytez.com/v1/run", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + BYTEZ_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: prompt
      })
    });

    const text = await res.text(); // 👈 JSON nahi, TEXT

    return new Response(JSON.stringify({
      success: true,
      status: res.status,
      raw_response: text   // 👈 yahan HTML aayegi
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};