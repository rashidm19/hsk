#!/bin/bash
# One-time rebrand: Mandarin Zone → HSK Prep
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FILES=$(find . -type f \( \
  -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.md' -o -name '*.json' -o -name '*.xml' -o -name 'LICENSE' -o -name 'PROMO.md' -o -name 'robots.txt' \
\) ! -path './.git/*' ! -path './scripts/rebrand.sh')

for f in $FILES; do
  perl -i -pe '
    s|https://www\.mandarinzone\.com/wp-content/uploads/2015/01/logo\.png|/logo-light.svg|g;
    s|alt="Mandarin Zone"|alt="HSK Prep"|g;
    s|Mandarin Zone|HSK Prep|g;
    s|mandarin zone|HSK Prep|gi;
    s|HSK 4 <span>Mock Exam</span>|HSK <span>Prep</span>|g;
    s|Learn Chinese in Beijing &amp; Online · Since 2008|Free HSK 4 practice tests \& study tools|g;
    s|Learn Chinese in Beijing \& Online · Since 2008|Free HSK 4 practice tests \& study tools|g;
    s|Learn Chinese in Beijing & Online since 2008|Free HSK 4 practice tests \& study tools|g;
    s|by HSK Prep Beijing|by HSK Prep|g;
    s|by HSK Prep Beijing\.|by HSK Prep.|g;
    s|Visit HSK Prep|Start practicing|g;
    s|href="https://www\.mandarinzone\.com/"|href="/"|g;
    s|href="https://mandarinzone\.com"|href="/"|g;
    s|href="https://www\.mandarinzone\.com/contact-us/"|href="/guide/"|g;
    s|href="mailto:info@mandarinzone\.com"|href="https://github.com/Make-dream-clear/hsk4-mock-exam"|g;
    s|info@mandarinzone\.com|GitHub|g;
    s|Start Learning at HSK Prep|Start preparing|g;
    s|og:image" content="/logo-light\.svg"|og:image" content="https://hsk4.mandarinzone.com/logo.svg"|g;
    s|HSK Prep — HSK 4|HSK Prep — HSK 4|g;
  ' "$f"
done

# Landing page & footers on light backgrounds use dark logo
perl -i -pe 's|/logo-light\.svg" alt="HSK Prep" width|/logo.svg" alt="HSK Prep" width|g' "$ROOT/index.html"
perl -i -pe 's|class="footer-logo" loading="lazy">|class="footer-logo" loading="lazy" src="/logo.svg"|g' "$ROOT/index.html" 2>/dev/null || true

# Footer logos: light wordmark on paper footer
find . -name '*.html' -exec perl -i -pe '
  s|(<img src=")/logo-light\.svg(" alt="HSK Prep" class="footer-logo")|$1/logo.svg$2|g;
' {} +

echo "Rebrand complete."
