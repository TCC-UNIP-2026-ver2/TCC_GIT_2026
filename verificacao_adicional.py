#!/usr/bin/env python3
"""
verificacao_adicional.py — verificação adicional dos resultados do MyVicinity.

Para cada cenário, a partir da resposta bruta da API (respostas/*.json) e das coordenadas
dos CSVs (resultados.csv), este script:
  1) recalcula as distâncias de Haversine entre o ponto consultado (arredondado a 5 casas,
     como faz a rota /api/score) e cada POI, e compara com a distância devolvida pela API;
  2) confere se todos os POIs estão a até 1 km;
  3) recalcula as notas por categoria e a nota final (Equações 3.1 a 3.7) e compara com as da API.

Uso (Python 3.8+, sem dependências):
  python3 verificacao_adicional.py rodada1/resultados.csv rodada2/resultados.csv rodada2/respostas
"""
import csv, json, math, re, sys, os

PESOS = {"transporte": 28.1, "saude": 20.6, "comercio": 18.5, "educacao": 15.3,
         "administrativo": 7.5, "lazer": 5.6, "religioso": 4.4}
TOTAL = {"transporte": 4, "educacao": 3, "comercio": 5, "saude": 6,
         "administrativo": 4, "lazer": 3, "religioso": 1}
R_TERRA_KM = 6371.0
RAIO_KM = 1.0

def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R_TERRA_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def nota_distancia(d, dmax):
    if d <= 0.1: return 50.0
    if d >= dmax: return 0.0
    return 50.0 * (1 - (d - 0.1) / (dmax - 0.1))

def nome_arquivo(nome):                       # mesma regra do testes.mjs
    return re.sub(r"[^a-z0-9]+", "_", nome, flags=re.I) + ".json"

def main(args):
    if len(args) < 2:
        print(__doc__); return 2
    pasta = args[-1]
    coords = {}
    for caminho in args[:-1]:
        with open(caminho, newline="", encoding="utf-8") as f:
            for linha in csv.DictReader(f):
                if linha.get("nota_api", "").startswith("ERRO"):
                    continue
                coords[nome_arquivo(linha["local"])] = (linha["local"], float(linha["lat"]), float(linha["lon"]))
    tudo_ok = True
    print(f"{'cenário':42s} {'POIs':>5s} {'dist. máx. (km)':>16s} {'Δ dist. máx. (m)':>17s} {'Δ nota máx.':>12s}  status")
    for arq in sorted(os.listdir(pasta)):
        if not arq.endswith(".json"): continue
        if arq not in coords:
            print(f"[pulado] {arq}: sem coordenadas nos CSVs informados"); continue
        nome, lat, lon = coords[arq]
        lat5, lon5 = round(lat, 5), round(lon, 5)
        j = json.load(open(os.path.join(pasta, arq), encoding="utf-8"))
        n, dmax_obs, ddist = 0, 0.0, 0.0
        final, dnota = 0.0, 0.0
        for cat, total in TOTAL.items():
            melhor = {}
            for e in j["categories"].get(cat, []):
                n += 1
                d = haversine_km(lat5, lon5, e["latitude"], e["longitude"])
                ddist = max(ddist, abs(d - e["distance"]) * 1000)
                dmax_obs = max(dmax_obs, e["distance"])
                t = e["establishmentType"]
                melhor[t] = min(melhor.get(t, 1e9), d)
            var = len(melhor) / total * 50
            dist = sum(nota_distancia(d, RAIO_KM) for d in melhor.values()) / len(melhor) if melhor else 0.0
            nc = var + dist
            dnota = max(dnota, abs(nc - j["scores"][cat]))
            final += nc * PESOS[cat] / 100
        dnota = max(dnota, abs(final - j["overallScore"]))
        ok = ddist < 0.01 and dnota < 1e-6 and dmax_obs <= RAIO_KM
        tudo_ok &= ok
        print(f"{nome[:42]:42s} {n:5d} {dmax_obs:16.4f} {ddist:17.4f} {dnota:12.2e}  {'OK' if ok else 'DIVERGE'}")
    print("\nTodos os cenários conferem." if tudo_ok else "\nHá divergências.")
    return 0 if tudo_ok else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
