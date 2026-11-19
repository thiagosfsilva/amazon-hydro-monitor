# ---
# project: amazon-hydro-monitor
# purpose: Merge revised ANA daily levels into the monitor's dated station files
# author: OpenAI Codex for Thiago Silva
# ---
import datetime as dt
import json
import math
import os
from collections import defaultdict
from pathlib import Path
from statistics import mean
from zoneinfo import ZoneInfo
from ana_request import request

end = dt.datetime.now(ZoneInfo("America/Manaus")).date() - dt.timedelta(days=1)
stations = json.loads(Path("data/reference.json").read_text(encoding="utf8"))["stations"]
token = request("OAUth/v1", {"Identificador": os.environ["ANA_USER"], "Senha": os.environ["ANA_PASS"]})["tokenautenticacao"]
updated = 0
for station in stations:
    code = station["code"]
    folder = Path("data") / code
    files = sorted(folder.glob("[0-9][0-9][0-9][0-9].json"))
    years = {f.stem: json.loads(f.read_text()) for f in files}
    latest = max(date for rows in years.values() for date in rows)
    start = min(end - dt.timedelta(days=13), dt.date.fromisoformat(latest) - dt.timedelta(days=1))
    cursor = end
    days = defaultdict(dict)
    try:
        while cursor >= start:
            items = request("HidroinfoanaSerieTelemetricaAdotada/v2",
                            {"Authorization": "Bearer " + token},
                            {"Codigos_Estacoes": code, "Tipo Filtro Data": "DATA_LEITURA",
                             "Data de Busca (yyyy-MM-dd)": cursor.isoformat(), "Range Intervalo de busca": "DIAS_14"})
            for item in items or []:
                stamp = item["Data_Hora_Medicao"]
                date = dt.date.fromisoformat(stamp[:10])
                value = item.get("Cota_Adotada")
                if str(item["codigoestacao"]) != code or not start <= date <= end:
                    continue
                if value in (None, "") or str(item.get("Cota_Adotada_Status")) == "2":
                    continue
                cm = float(str(value).replace(",", "."))
                if math.isfinite(cm):
                    days[date.isoformat()][stamp] = cm
            cursor -= dt.timedelta(days=14)
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print(f"::warning::Station {code}: {type(error).__name__}; keeping previous data")
        continue
    if not days:
        print(f"::warning::Station {code}: no usable levels; keeping previous data")
        continue
    for date, readings in days.items():
        correction = 4.963 if code == "12900001" and date >= "2024-09-06" else 0
        years.setdefault(date[:4], {})[date] = round(mean(readings.values()) / 100 - correction, 6)
    for year in {date[:4] for date in days}:
        (folder / f"{year}.json").write_text(json.dumps(years[year], sort_keys=True, indent=1)+"\n")
    updated += 1
    print(f"{code}: {len(days)} days merged, latest returned {max(days)}")
if not updated:
    raise RuntimeError("No stations refreshed")
