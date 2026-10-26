import "server-only";

export interface EnvoiWhatsApp {
  to: string; // E.164, ex: +221770000000
  message: string; // Texte complet (mode texte / webhook)
  templateParams: string[]; // Paramètres du template Meta (mode template)
  meta: Record<string, unknown>; // Infos additionnelles transmises au webhook
}

export type ResultatEnvoi =
  | { statut: "envoye"; canal: "cloud_api" | "webhook" }
  | { statut: "echec"; erreur: string }
  | { statut: "manuel" };

/**
 * Envoi du récapitulatif au traiteur, par ordre de priorité :
 * 1. WhatsApp Cloud API (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID)
 *    - avec WHATSAPP_TEMPLATE_NAME : message template (obligatoire hors fenêtre de 24h)
 *    - sinon : message texte libre (le traiteur doit avoir écrit au numéro dans les 24h)
 * 2. Webhook générique (WHATSAPP_WEBHOOK_URL) : Make, Zapier, n8n, CallMeBot...
 * 3. Aucun canal configuré : "manuel", le RH utilise le bouton WhatsApp du cockpit.
 */
export async function envoyerWhatsApp(envoi: EnvoiWhatsApp): Promise<ResultatEnvoi> {
  const to = envoi.to.replace(/\D/g, "");
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;

  try {
    if (token && phoneNumberId) {
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
      const body = templateName
        ? {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: templateName,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "fr" },
              components: [
                {
                  type: "body",
                  parameters: envoi.templateParams.map((text) => ({ type: "text", text })),
                },
              ],
            },
          }
        : {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { preview_url: true, body: envoi.message },
          };

      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { statut: "echec", erreur: `Cloud API ${res.status}: ${(await res.text()).slice(0, 300)}` };
      }
      return { statut: "envoye", canal: "cloud_api" };
    }

    if (webhookUrl) {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: `+${to}`, message: envoi.message, ...envoi.meta }),
      });
      if (!res.ok) {
        return { statut: "echec", erreur: `Webhook ${res.status}: ${(await res.text()).slice(0, 300)}` };
      }
      return { statut: "envoye", canal: "webhook" };
    }

    return { statut: "manuel" };
  } catch (err: any) {
    return { statut: "echec", erreur: err.message || "Erreur réseau" };
  }
}
