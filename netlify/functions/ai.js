// netlify/functions/ai.js
// Node 18+ (Netlify)
// Stocker HF_TOKEN dans les variables d'environnement Netlify (NEVER in client code)

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
  
      // Modèle simple et robuste pour génération (tu pourras changer ensuite)
      const model = process.env.HF_MODEL || "google/flan-t5-base";
  
      const hfRes = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: prompt }),
      });
  
      const data = await hfRes.json().catch(() => ({}));
  
      if (!hfRes.ok) {
        const msg = data?.error || `HuggingFace error (${hfRes.status})`;
        return new Response(JSON.stringify({ error: msg, details: data }), { status: hfRes.status });
      }
  
      // HF renvoie souvent : [{ generated_text: "..." }]
      // ou { generated_text: "..." } selon modèles
      const output =
        (Array.isArray(data) && data[0]?.generated_text) ||
        data?.generated_text ||
        JSON.stringify(data, null, 2);
  
      return new Response(JSON.stringify({ output }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || "Server error" }), { status: 500 });
    }
  };