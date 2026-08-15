# -*- coding: utf-8 -*-
"""Bäckt eine Attrappe zu einer Datei ohne Aussenverweise zusammen.

Die Fassung zum Herzeigen darf nichts nachladen: Schriften und Bilder gehen
als data:-Adressen mit hinein, und Doctype, html, head und body fallen weg,
weil die Umgebung sie selbst mitbringt.

Aufruf:  python3 .scratch/mock/artefakt.py v20-vorbereiten
"""
import base64, mimetypes, pathlib, re, sys

WURZEL = pathlib.Path(__file__).resolve().parents[2]
MOCK = WURZEL / ".scratch" / "mock"

name = sys.argv[1] if len(sys.argv) > 1 else sys.exit("Name der Attrappe fehlt")
quelle = MOCK / f"{name}.html"
ziel = MOCK / f"{name}.artifact.html"
s = quelle.read_text(encoding="utf-8")


def datenadresse(pfad: pathlib.Path) -> str:
    typ = mimetypes.guess_type(pfad.name)[0] or "application/octet-stream"
    if pfad.suffix == ".woff2":
        typ = "font/woff2"
    return f"data:{typ};base64," + base64.b64encode(pfad.read_bytes()).decode("ascii")


gezaehlt = {}


def aufloesen(treffer):
    rel = treffer.group("pfad")
    datei = (MOCK / rel).resolve()
    if not datei.is_file():
        sys.exit(f"FEHLT: {rel}")
    gezaehlt[rel] = datei.stat().st_size
    return treffer.group("vor") + datenadresse(datei) + treffer.group("nach")


# url('../../public/…')  ·  src="../../public/…"  ·  data-anim-…="../../public/…"
s = re.sub(r"(?P<vor>url\(')(?P<pfad>\.\./\.\./public/[^']+)(?P<nach>'\))", aufloesen, s)
s = re.sub(r'(?P<vor>=")(?P<pfad>\.\./\.\./public/[^"]+)(?P<nach>")', aufloesen, s)

if "../../public/" in s:
    sys.exit("FEHLER: es bleiben Aussenverweise stehen")

# Rahmen abnehmen — die Umgebung bringt ihn mit.
s = re.sub(r"^<!doctype html>\s*\n", "", s, flags=re.I)
s = re.sub(r"^<html[^>]*>\s*\n", "", s, flags=re.M)
s = re.sub(r"^\s*</?(head|body)>\s*\n", "", s, flags=re.M)
s = re.sub(r"\s*</html>\s*$", "\n", s)
s = re.sub(r'^\s*<meta charset[^>]*>\s*\n', "", s, flags=re.M)
s = re.sub(r'^\s*<meta name="viewport"[^>]*>\s*\n', "", s, flags=re.M)
s = s.lstrip("\n")

ziel.write_text(s, encoding="utf-8")

print(f"{quelle.name} → {ziel.name}")
for rel, groesse in sorted(gezaehlt.items(), key=lambda p: -p[1]):
    print(f"  {groesse/1024:8.1f} KB  {rel}")
print(f"  {'-'*8}")
print(f"  {ziel.stat().st_size/1024/1024:8.2f} MB  fertig")
