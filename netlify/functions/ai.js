// netlify/functions/ai.js
// Netlify Function proxy -> Hugging Face Router (OpenAI-compatible Chat Completions)
// Secret: HF_TOKEN (Netlify env var)
// Model: HF_MODEL (default: HuggingFaceTB/SmolLM3-3B:hf-inference)

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

    // ✅ Model must be available via the provider used (hf-inference here)
    const model = process.env.HF_MODEL || "HuggingFaceTB/SmolLM3-3B:hf-inference";

    const url = "https://router.huggingface.co/v1/chat/completions";

    const hfRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 450,
      }),
    });

    const data = await hfRes.json().catch(() => ({}));

    if (!hfRes.ok) {
      const msg = data?.error?.message || data?.error || `Hugging Face error (${hfRes.status})`;
      return new Response(JSON.stringify({ error: msg, details: data }), {
        status: hfRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

      let output =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      JSON.stringify(data, null, 2);
    
    // Nettoyage des modèles qui renvoient <think>...</think>
    output = String(output).replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();      

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