#!/usr/bin/env bash
# Régénère .claude/SCHEMA-INDEX.md depuis supabase/schema.sql
# v6 : fix extraction des triggers (nom en fin de ligne).

set -e

SCHEMA="supabase/schema.sql"
OUT=".claude/SCHEMA-INDEX.md"

if [ ! -f "$SCHEMA" ]; then
  echo "❌ $SCHEMA introuvable. Lance depuis la racine du projet."
  exit 1
fi

mkdir -p .claude

extract() {
  local label="$1"
  local grep_re="$2"
  local sed_clean="$3"

  echo "## $label"
  echo ""

  local entries
  entries=$(grep -nE "$grep_re" "$SCHEMA" 2>/dev/null | while IFS= read -r l; do
    local ligne="${l%%:*}"
    local rest="${l#*:}"
    local nom
    nom=$(printf '%s' "$rest" | sed -E "$sed_clean")
    if [ -n "$nom" ] && [ "$nom" != "$rest" ]; then
      printf '%s\t%s\n' "$nom" "$ligne"
    fi
  done)

  local noms
  noms=$(printf '%s' "$entries" | cut -f1 | sort -u | grep -v '^$' || true)

  for nom in $noms; do
    local lignes
    lignes=$(printf '%s' "$entries" | awk -F'\t' -v n="$nom" '$1 == n {print $2}' | sort -n)
    [ -z "$lignes" ] && continue

    local total
    total=$(echo "$lignes" | wc -l | tr -d ' ')

    local derniere
    derniere=$(echo "$lignes" | tail -1)

    if [ "$total" -le 1 ]; then
      echo "- \`$nom\` — L$derniere"
    else
      local mortes
      mortes=$(echo "$lignes" | sed '$d' | tr '\n' ' ' | sed 's/ $//')
      echo "- \`$nom\` — L$derniere **(active)** · remplace L${mortes// /, L}"
    fi
  done
  echo ""
}

{
  echo "# Index de schema.sql"
  echo ""
  echo "> **Fichier généré automatiquement.** Ne pas éditer à la main."
  echo "> Régénérer : \`bash scripts/schema-index.sh\`"
  echo ""
  echo "**Total : $(wc -l < "$SCHEMA" | tr -d ' ') lignes.**"
  echo ""

  extract "Tables" \
    '^CREATE TABLE IF NOT EXISTS public\.' \
    's/^CREATE TABLE IF NOT EXISTS public\.([a-z_]+).*/\1/'

  extract "Vues" \
    '^CREATE OR REPLACE VIEW public\.' \
    's/^CREATE OR REPLACE VIEW public\.([a-z_]+).*/\1/'

  extract "Fonctions" \
    '^CREATE OR REPLACE FUNCTION public\.' \
    's/^CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(.*/\1/'

  extract "Policies" \
    '^CREATE POLICY ' \
    's/^CREATE POLICY ([a-z_]+) ON.*/\1/'

  # ✅ FIX v6 : retire l'espace obligatoire après le nom
  extract "Triggers" \
    '^[[:space:]]*CREATE TRIGGER ' \
    's/^[[:space:]]*CREATE TRIGGER ([a-z_]+).*/\1/'

  echo "## Index nommés"
  echo ""
  grep -nE "^[[:space:]]*CREATE (UNIQUE )?INDEX " "$SCHEMA" 2>/dev/null | \
    sed -nE 's/^([0-9]+):[[:space:]]*CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?([a-z_]+).*/- `\4` — L\1/p' || true
  echo ""

  echo "## Contraintes CHECK"
  echo ""
  grep -nE "ADD CONSTRAINT [a-z_]+.*CHECK" "$SCHEMA" 2>/dev/null | \
    sed -nE 's/^([0-9]+):.*ADD CONSTRAINT ([a-z_]+).*CHECK.*/- `\2` — L\1/p' || true
  echo ""

  echo "## Blocs de migration (v1.x)"
  echo ""
  grep -nE "^-- v[0-9]+\." "$SCHEMA" 2>/dev/null | \
    sed -E 's/^([0-9]+):-- (.+)$/- L\1 : \2/' || true
  echo ""

  echo "## Notes pour l'agent"
  echo ""
  echo "- Les blocs v1.x sont en fin de fichier et **remplacent** les"
  echo "  définitions antérieures. La ligne active est la **dernière**"
  echo "  occurrence."
  echo "- Les patterns \`DROP ... IF EXISTS ; CREATE ...\` sont idempotents :"
  echo "  l'objet est **actif** après le CREATE."
  echo "- **Attention** : une policy droppée **sans** \`CREATE\` après n'est"
  echo "  plus active. Exemple dans ce schéma : \`salarie_et_restaurant_lisent_les_menus\`"
  echo "  (L724) a été droppée par v1.9 et remplacée par \`salarie_lit_les_menus\`"
  echo "  + \`restaurant_lit_ses_menus\`. Ne pas l'auditer."
  echo "- Quand tu lis une fonction ou une policy, **lis la version active**"
  echo "  (la ligne avec \`(active)\` ou la seule ligne)."
} > "$OUT"

echo "✅ Index généré : $OUT"
echo "   $(wc -l < "$OUT" | tr -d ' ') lignes, $(du -h "$OUT" | cut -f1)"