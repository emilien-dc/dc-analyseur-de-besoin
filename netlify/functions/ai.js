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

    const model = process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
    const url = "https://router.huggingface.co/v1/completions";

    const hfRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: prompt,
        temperature: 0.1,
        max_tokens: 700,
      }),
    });

    const data = await hfRes.json().catch(() => ({}));

    if (!hfRes.ok) {
      const rawMsg =
        data?.error?.message ||
        data?.error ||
        `Hugging Face error (${hfRes.status})`;

      return new Response(
        JSON.stringify({
          error: rawMsg,
          details: { status: hfRes.status },
        }),
        {
          status: hfRes.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let output = data?.choices?.[0]?.text || "";

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