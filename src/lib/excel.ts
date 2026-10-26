import "server-only";
import ExcelJS from "exceljs";

export interface LigneEmploye {
  nom: string;
  telephone?: string;
  service?: string;
}

const MAX_LIGNES = 2000;

function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

type Colonne = "nom" | "prenom" | "telephone" | "service" | "nomcomplet";

function identifierColonne(entete: string): Colonne | null {
  const e = normaliser(entete);
  if (["prenom", "prenoms", "firstname"].includes(e)) return "prenom";
  if (["nomcomplet", "nometprenom", "prenometnom", "nomprenom", "prenomnom", "collaborateur", "employe", "fullname"].includes(e))
    return "nomcomplet";
  if (["nom", "nomdefamille", "lastname", "name"].includes(e)) return "nom";
  if (e.startsWith("tel") || e.includes("phone") || e.includes("whatsapp") || e.includes("portable") || e === "mobile")
    return "telephone";
  if (["service", "departement", "direction", "equipe", "pole", "department"].includes(e)) return "service";
  return null;
}

function texteCellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  if (typeof valeur === "object") {
    const v = valeur as any;
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("").trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    return "";
  }
  return String(valeur).trim();
}

/**
 * Transforme un tableau de lignes (1ère ligne = en-têtes si reconnues) en employés.
 * Sans en-têtes reconnues : ordre positionnel Nom, Téléphone, Service.
 */
export function lignesVersEmployes(lignes: string[][]): LigneEmploye[] {
  const nonVides = lignes.filter((l) => l.some((c) => c.trim()));
  if (nonVides.length === 0) return [];

  const colonnes = nonVides[0].map(identifierColonne);
  const aDesEntetes = colonnes.some((c) => c === "nom" || c === "nomcomplet" || c === "prenom");
  const index = (c: Colonne) => colonnes.indexOf(c);

  const donnees = aDesEntetes ? nonVides.slice(1) : nonVides;
  const resultat: LigneEmploye[] = [];

  for (const l of donnees.slice(0, MAX_LIGNES)) {
    const get = (i: number) => (i >= 0 ? (l[i] || "").trim() : "");
    let nom: string;
    let telephone: string;
    let service: string;

    if (aDesEntetes) {
      const complet = get(index("nomcomplet"));
      nom = complet || [get(index("prenom")), get(index("nom"))].filter(Boolean).join(" ");
      telephone = get(index("telephone"));
      service = get(index("service"));
    } else {
      [nom, telephone, service] = [get(0), get(1), get(2)];
    }

    nom = nom.replace(/\s+/g, " ").slice(0, 80);
    if (nom.length < 2) continue;
    resultat.push({
      nom,
      telephone: telephone || undefined,
      service: service ? service.slice(0, 60) : undefined,
    });
  }
  return resultat;
}

export function parseCsv(texte: string): string[][] {
  return texte
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((ligne) => ligne.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim()));
}

/** Lit un fichier .xlsx ou .csv et retourne les employés trouvés dans la 1ère feuille */
export async function parseFichierEmployes(fichier: File): Promise<LigneEmploye[]> {
  const nomFichier = fichier.name.toLowerCase();

  if (nomFichier.endsWith(".csv") || nomFichier.endsWith(".txt")) {
    return lignesVersEmployes(parseCsv(await fichier.text()));
  }

  if (!nomFichier.endsWith(".xlsx")) {
    throw new Error("Format non supporté : enregistrez le fichier en .xlsx ou .csv.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await fichier.arrayBuffer()) as any);
  const feuille = workbook.worksheets[0];
  if (!feuille) return [];

  const lignes: string[][] = [];
  feuille.eachRow({ includeEmpty: false }, (row) => {
    const valeurs = row.values as unknown[]; // index 0 vide en ExcelJS
    lignes.push(valeurs.slice(1).map(texteCellule));
  });
  return lignesVersEmployes(lignes);
}
