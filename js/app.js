const btn = document.getElementById("analyzeBtn");
const loader = document.getElementById("loader");
const resultZone = document.getElementById("resultZone");
const resultContent = document.getElementById("resultContent");
const textArea = document.getElementById("needs");

const getSector = () => document.getElementById("sector")?.value || "BTP";
const getRequestType = () => document.getElementById("requestType")?.value || "devis";
const getUrgency = () => document.getElementById("urgency")?.value || "moyenne";

function sectorGuidelines(sector) {
  if (sector === "BTP") {
    return `Contexte BTP : raisonne en postes (déplacement, main d'œuvre, fournitures, location matériel, évacuation, marges, aléas chantier).
Si la demande touche à isolation/menuiseries/chauffage, liste les infos techniques manquantes (surfaces, accès, état existant, contraintes, délais).`;
  }
  if (sector === "Industrie") {
    return `Contexte industrie : prends en compte HSE/sécurité, arrêt de production, conformité, maintenance, pièces, accès site, horaires, consignations.
Si intervention technique : demande relevés, plans, photos, contraintes HSE et fenêtres d'intervention.`;
  }
  return `Contexte services : précise le périmètre, le temps homme, l'urgence, les livrables, dépendances et risques de dérive.`;
}

function buildPrompt({ sector, requestType, urgency, need }) {
  return `
Tu es un assistant IA pour une PME (${sector}).
Type de demande : ${requestType}. Urgence : ${urgency}.

Objectif : pré-qualifier la demande client et proposer un pré-chiffrage INDICATIF utile au tri commercial.
Inclure :
- Une estimation de marge raisonnable (si applicable)
- Les hypothèses économiques retenues
Ce pré-chiffrage est un outil d’aide à la décision interne et ne constitue pas un devis contractuel.
${sectorGuidelines(sector)}

RÈGLES STRICTES :
- Réponds uniquement en français.
- N'affiche jamais ton raisonnement interne.
- Respecte EXACTEMENT le format demandé.
- N’ajoute aucune section supplémentaire.
- N’écris rien avant la section 1).

FORMAT EXACT :
1) Reformulation de la demande (2-3 phrases)
2) Questions à poser avant devis (5 à 10 questions)
3) Pré-chiffrage indicatif : fourchette (€) + confiance + hypothèses (3 puces)
4) Risques / aléas (3 à 6 puces)
5) Prochaine étape recommandée (1 action claire)

DEMANDE CLIENT :
"""${need}"""
`.trim();
}

function setLoading(isLoading) {
  // Tu utilises "hidden" Tailwind -> OK
  btn.classList.toggle("hidden", isLoading);
  loader.classList.toggle("hidden", !isLoading);
}

function escapeHtml(str) {
  return String(str)
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
    // on récupère le message friendly renvoyé par la function
    throw new Error(data?.error || `Erreur serveur (${res.status})`);
  }

  return data.output || "";
}

function normalizeOutput(text) {
  // nettoyage léger : trims, doubles lignes, etc.
  let t = String(text || "").trim();
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t;
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

      const raw = await callAI(prompt);
      const output = normalizeOutput(raw);

      resultContent.innerHTML = `<pre class="whitespace-pre-wrap">${escapeHtml(output)}</pre>`;
      resultZone.classList.remove("hidden");

      // scroll vers le résultat (effet “démo”)
      resultZone.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      resultContent.innerHTML = `<p class="text-red-600 font-semibold">${escapeHtml(
        e.message || "Erreur inconnue"
      )}</p>`;
      resultZone.classList.remove("hidden");
      resultZone.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setLoading(false);
    }
  });
});