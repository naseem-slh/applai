# -*- coding: utf-8 -*-
"""Schneidet Marke und Figuren zu und legt sie unter public/ ab.

Aufruf: python3 .scratch/mock/assets.py
"""
from PIL import Image
import os, struct

SRC = "/mnt/c/Users/Samira/Desktop/character applai"
DST = "/home/samira/projects/applai/public"
os.makedirs(DST + "/marke", exist_ok=True)
os.makedirs(DST + "/figuren", exist_ok=True)


def durations(p):
    """PIL liest die Einzelbilddauern nicht aus, also holen wir sie aus den
    ANMF-Blöcken. Sie sind nicht gleichmäßig: Die Haltebilder am Anfang und
    Ende dauern 200 bzw. 320ms und tragen den Rhythmus."""
    d = open(p, "rb").read()
    i, out = 12, []
    while i < len(d) - 8:
        tag = d[i:i+4]
        sz = struct.unpack("<I", d[i+4:i+8])[0]
        if tag == b"ANMF":
            out.append(int.from_bytes(d[i+8+12:i+8+15], "little"))
        i += 8 + sz + (sz & 1)
    return out


def frames(p):
    im = Image.open(p)
    out = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        out.append(im.convert("RGBA"))
    return out


# =====================================================================
# Marke
# =====================================================================
# Standbild und Bewegung müssen exakt gleich beschnitten werden, sonst
# springt das Bild beim Übergang. Der Kasten ist die Vereinigung aller
# Bilder, damit die ausschlagenden Arme hineinpassen.
box = None
for f in ["logo-still.webp", "logo-panic.webp", "logo-still-white.webp", "logo-panic-white.webp"]:
    for fr in frames(f"{SRC}/{f}"):
        bb = fr.getchannel("A").getbbox()
        box = bb if box is None else (min(box[0],bb[0]), min(box[1],bb[1]), max(box[2],bb[2]), max(box[3],bb[3]))
pad = 6
box = (max(0,box[0]-pad), max(0,box[1]-pad), min(1024,box[2]+pad), min(1024,box[3]+pad))

W = 640
h = round((box[3]-box[1]) * W / (box[2]-box[0]))
print(f"Marke: Kasten {box} → Ausgabe {W}x{h}")

for f, name in [("logo-still.webp","logo-ruhe.webp"), ("logo-still-white.webp","logo-ruhe-hell.webp")]:
    frames(f"{SRC}/{f}")[0].crop(box).resize((W,h), Image.LANCZOS) \
        .save(f"{DST}/marke/{name}", "WEBP", quality=92, method=6)

for f, name in [("logo-panic.webp","logo-schreck.webp"), ("logo-panic-white.webp","logo-schreck-hell.webp")]:
    fs = [fr.crop(box).resize((W,h), Image.LANCZOS) for fr in frames(f"{SRC}/{f}")]
    fs[0].save(f"{DST}/marke/{name}", "WEBP", save_all=True, append_images=fs[1:],
               duration=durations(f"{SRC}/{f}"), loop=0, quality=65, method=4)


# =====================================================================
# Figuren
# =====================================================================
# --- Wie groß ist die Figur wirklich? --------------------------------------
# Die Bildhöhe taugt nicht als Maß. Beim Schirm nimmt die Wolke die obere
# Hälfte, beim Luftballon der Ballon, beim Jonglieren stehen die Bälle über
# dem Kopf: Gleich hohe Bilder ergeben verschieden große Personen.
#
# Gemessen wurde deshalb die Kopfbreite — die größte zusammenhängende Fläche
# in Hautfarbe. Zur Kontrolle gegen den Pupillendurchmesser gehalten (schwarze
# Scheiben, von Weiß umschlossen und darum eigene Flächen); beide Maße stimmen
# auf ein Prozent überein.
#
#   Figur         Kopfbreite bei 640px Bildhöhe
#   warten             316px
#   jubeln             308px
#   spaehen            371px
#   schirm             214px      ← Wolke und Schirm nehmen Platz weg
#   inkognito          312px
#   jonglieren         317px
#   luftballon         209px      ← Ballon und Schnur nehmen Platz weg
#
# Für eine gewünschte Kopfbreite K ist die Anzeigehöhe also
#   H = K * 640 / Kopfbreite
# Bei K = 66px, wie auf Datenschutz- und Einstellungsseite verwendet:
#   schirm 129x197 · inkognito 87x135 · jonglieren 104x133 · luftballon 121x202


def ablegen(quelle, ziel, hoehe):
    im = Image.open(f"{SRC}/webp/{quelle}.webp").convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    b = round(im.width * hoehe / im.height)
    im.resize((b,hoehe), Image.LANCZOS).save(f"{DST}/figuren/{ziel}", "WEBP", quality=92, method=6)


ablegen("sitting-reading-book", "warten.webp", 640)
ablegen("cheering-fists-up", "jubeln.webp", 640)

# Für die Datenschutzseite: der Schirm steht für das, was trocken bleibt,
# die Sonnenbrille für das, was hinausgeht, ohne erkannt zu werden.
ablegen("holding-umbrella-in-rain", "schirm.webp", 640)
ablegen("sunglasses-hands-on-hips", "inkognito.webp", 640)

# Für die Einstellungen: das Jonglieren steht für die Kette der Modelle,
# von denen eines übernimmt, wenn das vorige erschöpft ist, der Karton für
# die Sicherung.
ablegen("juggling-balls", "jonglieren.webp", 640)
ablegen("party-hat-with-balloon", "luftballon.webp", 640)


# --- Die Spähende ----------------------------------------------------
# Die Vorlage bringt ihre eigene Kante mit: einen schwarzen Senkrechtstrich,
# um den die Finger greifen. Diese Kante soll die Karte sein, nicht ein
# zweiter Strich daneben — und im Dunkelmodus wäre der schwarze Strich auf
# der dann blauen Kartenkontur ohnehin falsch.
#
# Also wird der Strich entfernt, aber nur dort, wo er blank dasteht: In den
# Zeilen, in denen rechts von ihm nichts liegt. Wo die Hände sind, gehören
# dieselben Punkte zur Handkontur und bleiben. Übrig bleibt eine Figur,
# deren Finger ins Leere greifen — und genau dorthin kommt die Kartenkante.
peek = Image.open(f"{SRC}/webp/peeking-around-corner.webp").convert("RGBA")
px = peek.load()
STRICH = range(758, 782)
gelöscht = 0
for y in range(peek.height):
    if any(px[x,y][3] > 40 for x in range(786, peek.width)):
        continue                      # hier greift eine Hand — nichts anfassen
    for x in STRICH:
        if px[x,y][3]:
            px[x,y] = (0,0,0,0)
            gelöscht += 1

kante = 769.5                          # Mitte des Strichs in der Vorlage
bb = peek.getchannel("A").getbbox()
peek = peek.crop(bb)
anteil = (kante - bb[0]) / (bb[2] - bb[0])
H = 640
B = round(peek.width * H / peek.height)
peek.resize((B,H), Image.LANCZOS).save(f"{DST}/figuren/spaehen.webp", "WEBP", quality=92, method=6)
print(f"Spähende: {gelöscht} Punkte des Strichs entfernt, Kante bei {anteil:.4f} der Breite")

print()
for ordner in ["marke", "figuren"]:
    for p in sorted(os.listdir(f"{DST}/{ordner}")):
        fp = f"{DST}/{ordner}/{p}"
        print(f"  {os.path.getsize(fp)/1024:8.1f} KB  {Image.open(fp).size}  {ordner}/{p}")
