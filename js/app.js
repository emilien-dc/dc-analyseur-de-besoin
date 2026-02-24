const btn = document.getElementById("analyzeBtn");
const loader = document.getElementById("loader");
const resultZone = document.getElementById("resultZone");
const resultContent = document.getElementById("resultContent");
const textArea = document.getElementById("needs");

// Valeurs dynamiques (toujours à jour)
const getSector = () => document.getElementById("sector")?.value || "BTP";
const getRequestType = () => document.getElementById("requestType")?.value || "devis";
const getUrgency = () => document.getElementById("urgency")?.value || "moyenne";

function buildPrompt({ sector, requestType, urgency, need }) {
  return `
Tu es un assistant IA pour une PME du secteur ${sector}.
Type de demande : ${requestType}. Urgence : ${urgency}.

Ta mission : aider à pré-qualifier la demande client et proposer un pré-chiffrage indicatif.

RÈGLES :
- Réponds en FRANÇAIS.
- Sois clair, structuré et actionnable.
- Si des infos manquent, liste les questions à poser.
- Le chiffrage est une FOURCHETTE indicative (pas un devis).
- Donne un niveau de confiance : Faible / Moyen / Élevé.

FORMAT EXACT :
1) Reformulation (2-3 phrases)
2) Informations manquantes (liste de 3 à 7 questions)
3) Pré-chiffrage (fourchette € + confiance)
4) Contraintes / risques (3 puces)
5) Prochaine étape recommandée (1 action)

DEMANDE CLIENT :
"""${need}"""
`.trim();
}

function setLoading(isLoading) {
  btn.classList.toggle("hidden", isLoading);
  loader.classList.toggle("hidden", !isLoading);
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function callAI(prompt) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `Erreur serveur (${res.status})`);
  }
  return data.output || "";
}

document.addEventListener("DOMContentLoaded", () => {
  btn.addEventListener("click", async () => {
    const need = textArea.value.trim();
    if (!need) {
      alert("Veuillez décrire un besoin avant de lancer l'analyse.");
      return;
    }

    setLoading(true);
    resultZone.classList.add("hidden");

    try {
      const prompt = buildPrompt({
        sector: getSector(),
        requestType: getRequestType(),
        urgency: getUrgency(),
        need,
      });

      const output = await callAI(prompt);

      resultContent.innerHTML = `<pre class="whitespace-pre-wrap">${escapeHtml(output)}</pre>`;
      resultZone.classList.remove("hidden");
    } catch (e) {
      resultContent.innerHTML = `<p class="text-red-600 font-semibold">${escapeHtml(
        e.message || "Erreur inconnue"
      )}</p>`;
      resultZone.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  });
});