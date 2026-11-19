# ---
# project: amazon-hydro-monitor
# purpose: Check authenticated ANA access from the publication runner
# author: OpenAI Codex for Thiago Silva
# ---
import datetime as dt
import http.client
import json
import os
from collections import defaultdict
from statistics import mean
from urllib.parse import urlencode
from zoneinfo import ZoneInfo


from ana_request import request

end = dt.datetime.now(ZoneInfo("America/Manaus")).date() - dt.timedelta(days=1)
start = end - dt.timedelta(days=6)
print(f"Requesting daily levels from {start} through {end}", flush=True)
auth = request("OAUth/v1", {"Identificador": os.environ["ANA_USER"], "Senha": os.environ["ANA_PASS"]})
stations = {"14990000": "Manaus", "31645000": "Belém"}
items = request("HidroinfoanaSerieTelemetricaAdotada/v2",
                {"Authorization": "Bearer " + auth["tokenautenticacao"]},
                {"Codigos_Estacoes": ",".join(stations), "Tipo Filtro Data": "DATA_LEITURA",
                 "Data de Busca (yyyy-MM-dd)": end.isoformat(), "Range Intervalo de busca": "DIAS_14"})
for code, name in stations.items():
    days = defaultdict(dict)
    for item in items:
        if str(item["codigoestacao"]) != code:
            continue
        stamp = item["Data_Hora_Medicao"]
        day = dt.date.fromisoformat(stamp[:10])
        value = item.get("Cota_Adotada")
        if start <= day <= end and value not in (None, "") and str(item.get("Cota_Adotada_Status")) != "2":
            days[day][stamp] = float(str(value).replace(",", ".")) / 100
    if not days:
        raise RuntimeError(f"No usable levels for {name}")
    for day, readings in sorted(days.items()):
        print(f"{name} {day}: {mean(readings.values()):.4f} m ({len(readings)} readings)")
