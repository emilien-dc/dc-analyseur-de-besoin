// netlify/functions/ai.js
// Netlify Function proxy -> Hugging Face Router (OpenAI-compatible Chat Completions)
// Env vars:
// - HF_TOKEN (secret) : Hugging Face access token
// - HF_MODEL (optional): e.g. "HuggingFaceTB/SmolLM3-3B:hf-inference"

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = process.env.HF_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: "HF_TOKEN missing on server" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const model = process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.3:hf-inference";
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
        max_tokens: 700,
      }),
    });

    const data = await hfRes.json().catch(() => ({}));

    if (!hfRes.ok) {
      const rawMsg =
        data?.error?.message ||
        data?.error ||
        `Hugging Face error (${hfRes.status})`;

      let friendly = rawMsg;

      if (hfRes.status === 401 || hfRes.status === 403) {
        friendly = "Accès refusé (token invalide ou permissions insuffisantes).";
      } else if (hfRes.status === 429) {
        friendly = "Quota atteint / trop de requêtes. Réessaie dans 1 minute.";
      } else if (hfRes.status === 503) {
        friendly = "Le modèle est en cours de démarrage ou surchargé. Réessaie dans 10–20 secondes.";
      }

      return new Response(
        JSON.stringify({
          error: friendly,
          details: { status: hfRes.status, raw: rawMsg },
        }),
        {
          status: hfRes.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let output =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "";

    // Remove <think>...</think> blocks if present
    output = String(output).replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();

    return new Response(JSON.stringify({ output }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e?.message || "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};