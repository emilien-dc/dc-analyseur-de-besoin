// netlify/functions/ai.js
// Proxy Netlify -> Hugging Face Router (hf-inference)
// Goal (option A / pédagogique): keep it free + robust output formatting
// Env vars:
// - HF_TOKEN (secret)
// - HF_MODEL (optional): default "HuggingFaceTB/SmolLM3-3B:hf-inference"

const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";

function stripThink(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

function ensureStartsAtSection1(text) {
  const t = String(text || "");
  const idx = t.search(/\n?1\)\s/);
  if (idx >= 0) return t.slice(idx).trim();
  // fallback: also accept "1." sometimes
  const idx2 = t.search(/\n?1\.\s/);
  if (idx2 >= 0) return t.slice(idx2).trim();
  return t.trim();
}

function looksLikeExpectedFormat(text) {
  const t = String(text || "");
  return /1\)\s/.test(t) && /2\)\s/.test(t) && /3\)\s/.test(t) && /4\)\s/.test(t) && /5\)\s/.test(t);
}

async function callHF(token, model, userPrompt, { max_tokens = 700 } = {}) {
  const res = await fetch(HF_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Tu es un assistant professionnel. Réponds uniquement en français. " +
            "N'affiche jamais ton raisonnement interne. " +
            "Respecte exactement le format demandé. " +
            "N'écris rien avant la section 1).",
        },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      top_p: 0.9,
      max_tokens,
    }),
  });

  const data = await res.json().catch(() => ({}));
  return { res, data };
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

    // ✅ safest free model (official example for hf-inference)
    const model = process.env.HF_MODEL || "HuggingFaceTB/SmolLM3-3B:hf-inference";

    // 1) First pass
    const { res: hfRes1, data: data1 } = await callHF(token, model, prompt, { max_tokens: 700 });

    if (!hfRes1.ok) {
      const rawMsg = data1?.error?.message || data1?.error || `Hugging Face error (${hfRes1.status})`;

      let friendly = rawMsg;
      if (hfRes1.status === 401 || hfRes1.status === 403) friendly = "Accès refusé (token invalide ou permissions insuffisantes).";
      else if (hfRes1.status === 429) friendly = "Quota atteint / trop de requêtes. Réessaie dans 1 minute.";
      else if (hfRes1.status === 503) friendly = "Le modèle est en cours de démarrage ou surchargé. Réessaie dans 10–20 secondes.";

      return new Response(JSON.stringify({ error: friendly, details: { status: hfRes1.status, raw: rawMsg } }), {
        status: hfRes1.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    let output1 = data1?.choices?.[0]?.message?.content || "";
    output1 = ensureStartsAtSection1(stripThink(output1));

    // 2) If format still not respected, do a second pass: "reformat only"
    let finalOutput = output1;
    if (!looksLikeExpectedFormat(finalOutput)) {
      const reformPrompt =
        `Reformate STRICTEMENT le texte suivant au format EXACT demandé ci-dessous. ` +
        `Ne rajoute rien. Ne commente pas. Réponds uniquement en français.\n\n` +
        `FORMAT EXACT :\n` +
        `1) Reformulation de la demande (2-3 phrases)\n` +
        `2) Questions à poser avant devis (5 à 10 questions)\n` +
        `3) Pré-chiffrage indicatif : fourchette (€) + confiance + hypothèses (3 puces)\n` +
        `4) Risques / aléas (3 à 6 puces)\n` +
        `5) Prochaine étape recommandée (1 action claire)\n\n` +
        `TEXTE À REFORMATER :\n"""${finalOutput}"""`;

      const { res: hfRes2, data: data2 } = await callHF(token, model, reformPrompt, { max_tokens: 700 });

      if (hfRes2.ok) {
        let output2 = data2?.choices?.[0]?.message?.content || "";
        output2 = ensureStartsAtSection1(stripThink(output2));
        if (looksLikeExpectedFormat(output2)) finalOutput = output2;
      }
    }

    return new Response(JSON.stringify({ output: finalOutput }), {
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