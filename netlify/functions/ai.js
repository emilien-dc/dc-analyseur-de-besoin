// netlify/functions/ai.js
// Proxy Netlify -> Hugging Face Router (hf-inference)
// 1) Chat completion via https://router.huggingface.co/v1/chat/completions
// 2) Optional EN->FR translation via https://router.huggingface.co/hf-inference/models/<translation_model>

const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";

function stripThink(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

// Heuristique très simple : si on voit beaucoup de mots anglais fréquents, on traduit.
function looksEnglish(text) {
  const t = (text || "").toLowerCase();
  const hits = [" the ", " and ", " to ", " of ", " i ", " need ", " should ", " maybe ", "first,"]
    .reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
  return hits >= 2;
}

async function translateToFrench(token, translateModel, text) {
  const url = `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(translateModel)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: text }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;

  // Sorties possibles selon le modèle
  const out =
    (Array.isArray(data) && data[0]?.translation_text) ||
    data?.translation_text ||
    (Array.isArray(data) && data[0]?.generated_text) ||
    data?.generated_text;

  return out ? String(out).trim() : null;
}

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

    // ✅ Modèle supporté par hf-inference (exemple officiel)
    const model = process.env.HF_MODEL || "HuggingFaceTB/SmolLM3-3B:hf-inference";

    const hfRes = await fetch(HF_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 700,
      }),
    });

    const data = await hfRes.json().catch(() => ({}));

    if (!hfRes.ok) {
      const rawMsg = data?.error?.message || data?.error || `Hugging Face error (${hfRes.status})`;

      let friendly = rawMsg;
      if (hfRes.status === 401 || hfRes.status === 403) {
        friendly = "Accès refusé (token invalide ou permissions insuffisantes).";
      } else if (hfRes.status === 429) {
        friendly = "Quota atteint / trop de requêtes. Réessaie dans 1 minute.";
      } else if (hfRes.status === 503) {
        friendly = "Le modèle est en cours de démarrage ou surchargé. Réessaie dans 10–20 secondes.";
      }

      return new Response(JSON.stringify({ error: friendly, details: { status: hfRes.status, raw: rawMsg } }), {
        status: hfRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    let output = data?.choices?.[0]?.message?.content || "";
    output = stripThink(output);

    // 🔁 Optionnel : traduction si le modèle sort en anglais
    const translateModel = process.env.HF_TRANSLATE_MODEL || "Helsinki-NLP/opus-mt-en-fr";
    if (output && looksEnglish(output)) {
      const fr = await translateToFrench(token, translateModel, output);
      if (fr) output = fr;
    }

    return new Response(JSON.stringify({ output }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};