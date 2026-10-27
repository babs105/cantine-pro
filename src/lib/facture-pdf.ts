import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { regrouperParPlat, type LigneFacturation } from "@/lib/facturation";

const A4: [number, number] = [595.28, 841.89];
const MARGE = 48;
const ORANGE = rgb(0.976, 0.451, 0.086);
const ENCRE = rgb(0.09, 0.09, 0.09);
const GRIS = rgb(0.45, 0.45, 0.45);
const FILET = rgb(0.85, 0.85, 0.85);
const FOND = rgb(1, 0.93, 0.835);

export interface EnteteFacture {
  companyNom: string;
  companySlug: string;
  responsable: string | null;
  email: string | null;
  telephone: string | null;
  mois: string; // YYYY-MM
}

/** Les polices standard PDF ne couvrent que WinAnsi : espaces fines, émojis, etc. sont remplacés */
function texte(s: string): string {
  return s
    .replace(/[\u202f\u00a0\u2009]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2026\u20ac\u2022]/g, "");
}

const fcfa = (n: number) => texte(`${n.toLocaleString("fr-FR")} FCFA`);

function libelleMois(mois: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mois}-15T12:00:00Z`)
  );
}

interface Colonne {
  titre: string;
  largeur: number;
  aDroite?: boolean;
}

/** Petit moteur de mise en page : écrit de haut en bas et ajoute une page quand il faut */
class Redacteur {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private normal: PDFFont,
    private gras: PDFFont,
    private piedDePage: string
  ) {}

  nouvellePage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGE;
    this.page.drawText(texte(this.piedDePage), { x: MARGE, y: 24, size: 8, font: this.normal, color: GRIS });
  }

  place(hauteur: number) {
    if (this.y - hauteur < 70) this.nouvellePage();
  }

  ecrire(s: string, opts: { taille?: number; gras?: boolean; couleur?: ReturnType<typeof rgb>; x?: number } = {}) {
    const taille = opts.taille ?? 10;
    this.place(taille + 6);
    this.page.drawText(texte(s), {
      x: opts.x ?? MARGE,
      y: this.y - taille,
      size: taille,
      font: opts.gras ? this.gras : this.normal,
      color: opts.couleur ?? ENCRE,
    });
    this.y -= taille + 6;
  }

  espace(h: number) {
    this.y -= h;
  }

  private ligneTableau(cellules: string[], colonnes: Colonne[], style: "entete" | "corps" | "total") {
    const h = 20;
    this.place(h);
    const largeurTotale = colonnes.reduce((a, c) => a + c.largeur, 0);
    if (style !== "corps") {
      this.page.drawRectangle({
        x: MARGE,
        y: this.y - h,
        width: largeurTotale,
        height: h,
        color: style === "entete" ? ORANGE : FOND,
      });
    } else {
      this.page.drawLine({
        start: { x: MARGE, y: this.y - h },
        end: { x: MARGE + largeurTotale, y: this.y - h },
        thickness: 0.5,
        color: FILET,
      });
    }
    const font = style === "corps" ? this.normal : this.gras;
    let x = MARGE;
    cellules.forEach((cellule, i) => {
      const col = colonnes[i];
      let s = texte(cellule);
      while (s.length > 1 && font.widthOfTextAtSize(s, 9) > col.largeur - 12) s = s.slice(0, -2) + "…";
      const w = font.widthOfTextAtSize(s, 9);
      this.page.drawText(s, {
        x: col.aDroite ? x + col.largeur - 6 - w : x + 6,
        y: this.y - 14,
        size: 9,
        font,
        color: style === "entete" ? rgb(1, 1, 1) : ENCRE,
      });
      x += col.largeur;
    });
    this.y -= h;
  }

  tableau(colonnes: Colonne[], lignes: string[][], total?: string[]) {
    this.ligneTableau(colonnes.map((c) => c.titre), colonnes, "entete");
    for (const l of lignes) this.ligneTableau(l, colonnes, "corps");
    if (total) this.ligneTableau(total, colonnes, "total");
  }

  signatures(gauche: string, droite: string) {
    this.place(110);
    this.espace(24);
    const largeur = (A4[0] - 2 * MARGE - 24) / 2;
    for (const [i, titre] of [gauche, droite].entries()) {
      const x = MARGE + i * (largeur + 24);
      this.page.drawText(texte(titre), { x, y: this.y - 10, size: 9, font: this.gras, color: ENCRE });
      this.page.drawRectangle({
        x,
        y: this.y - 90,
        width: largeur,
        height: 72,
        borderColor: FILET,
        borderWidth: 1,
      });
    }
    this.y -= 96;
  }
}

/**
 * Relevé mensuel PDF : une page de synthèse, une facture par restaurant (quantités × prix,
 * zone de signature et cachet) et la ventilation par service pour la paie.
 * Seuls les repas confirmés sont facturés (voir getLignesFacturation).
 */
export async function genererFacturePdf(entete: EnteteFacture, lignes: LigneFacturation[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const mois = libelleMois(entete.mois);
  const numero = `CP-${entete.companySlug.toUpperCase()}-${entete.mois.replace("-", "")}`;
  const emission = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Dakar" }).format(new Date());
  doc.setTitle(`Relevé repas ${entete.companyNom} — ${mois}`);
  doc.setAuthor("Cantine Pro");

  const r = new Redacteur(doc, normal, gras, `Cantine Pro • Relevé ${numero} • émis le ${emission}`);
  const repas = lignes.filter((l) => l.statut === "choisi");
  const nonConfirmes = lignes.filter((l) => l.statut === "non_confirme").length;
  const totalMontant = repas.reduce((a, l) => a + l.montant, 0);

  const enTete = (titre: string) => {
    r.nouvellePage();
    r.page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: ORANGE });
    r.ecrire(entete.companyNom, { taille: 16, gras: true });
    const contact = [entete.responsable, entete.email, entete.telephone].filter(Boolean).join(" • ");
    if (contact) r.ecrire(contact, { taille: 9, couleur: GRIS });
    r.espace(14);
    r.ecrire(titre, { taille: 13, gras: true, couleur: ORANGE });
    r.ecrire(`Période : ${mois}  •  N° ${numero}  •  Émis le ${emission}`, { taille: 9, couleur: GRIS });
    r.espace(10);
  };

  // 1. Synthèse
  const restaurants = Array.from(new Set(repas.map((l) => l.restaurant || "Sans restaurant"))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  enTete("RELEVÉ MENSUEL DES REPAS");
  r.tableau(
    [
      { titre: "Restaurant", largeur: 299 },
      { titre: "Repas", largeur: 80, aDroite: true },
      { titre: "Montant", largeur: 120, aDroite: true },
    ],
    restaurants.map((nom) => {
      const duResto = repas.filter((l) => (l.restaurant || "Sans restaurant") === nom);
      return [nom, String(duResto.length), fcfa(duResto.reduce((a, l) => a + l.montant, 0))];
    }),
    ["TOTAL DÛ", String(repas.length), fcfa(totalMontant)]
  );
  r.espace(12);
  r.ecrire("Seuls les repas confirmés par le restaurant (ou par le RH après accord téléphonique) sont facturés.", {
    taille: 8,
    couleur: GRIS,
  });
  if (nonConfirmes > 0) {
    r.ecrire(`${nonConfirmes} repas commandé(s) mais non confirmé(s) ne sont pas facturés.`, { taille: 8, couleur: GRIS });
  }
  if (repas.length === 0) r.ecrire("Aucun repas facturé sur la période.", { taille: 10 });

  // 2. Une facture par restaurant
  for (const nom of restaurants) {
    const duResto = repas.filter((l) => (l.restaurant || "Sans restaurant") === nom);
    const plats = regrouperParPlat(duResto);
    enTete(`FACTURE — ${nom}`);
    r.tableau(
      [
        { titre: "Plat", largeur: 239 },
        { titre: "Prix unitaire", largeur: 90, aDroite: true },
        { titre: "Quantité", largeur: 70, aDroite: true },
        { titre: "Total", largeur: 100, aDroite: true },
      ],
      plats.map((p) => [p.plat, fcfa(p.prix), String(p.quantite), fcfa(p.prix * p.quantite)]),
      ["TOTAL DÛ", "", String(duResto.length), fcfa(duResto.reduce((a, l) => a + l.montant, 0))]
    );
    r.signatures(`Pour ${entete.companyNom} (signature et cachet)`, `Pour ${nom} (signature et cachet)`);
  }

  // 3. Ventilation par service (déduction sur salaire)
  if (repas.length > 0) {
    enTete("VENTILATION PAR SERVICE");
    const services = Array.from(new Set(repas.map((l) => l.service))).sort((a, b) => a.localeCompare(b, "fr"));
    r.tableau(
      [
        { titre: "Service", largeur: 239 },
        { titre: "Employés", largeur: 80, aDroite: true },
        { titre: "Repas", largeur: 70, aDroite: true },
        { titre: "Montant", largeur: 110, aDroite: true },
      ],
      services.map((s) => {
        const duService = repas.filter((l) => l.service === s);
        return [
          s,
          String(new Set(duService.map((l) => l.nom)).size),
          String(duService.length),
          fcfa(duService.reduce((a, l) => a + l.montant, 0)),
        ];
      }),
      ["TOTAL", String(new Set(repas.map((l) => l.nom)).size), String(repas.length), fcfa(totalMontant)]
    );
    r.espace(8);
    r.ecrire("Le détail par employé figure dans l'export Excel « Paie par service ».", { taille: 8, couleur: GRIS });
  }

  return doc.save();
}
