// netlify/functions/ai.js
// Proxy serverless Netlify -> Hugging Face (router) with secret HF_TOKEN

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const token = process.env.HF_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: "HF_TOKEN missing on server" }), { status: 500 });
    }

    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400 });
    }

    const model = process.env.HF_MODEL || "google/flan-t5-base";

    // ✅ New endpoint: Hugging Face router + hf-inference provider
    const url = `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(model)}`;

    const hfRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    const data = await hfRes.json().catch(() => ({}));

    if (!hfRes.ok) {
      const msg = data?.error || `Hugging Face error (${hfRes.status})`;
      return new Response(JSON.stringify({ error: msg, details: data }), {
        status: hfRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const output =
      (Array.isArray(data) && data[0]?.generated_text) ||
      data?.generated_text ||
      JSON.stringify(data, null, 2);

    return new Response(JSON.stringify({ output }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};