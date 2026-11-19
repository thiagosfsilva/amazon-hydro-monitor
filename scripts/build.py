# ---
# project: amazon-hydro-monitor
# purpose: Assemble the public dashboard from reference data and saved telemetry
# author: OpenAI Codex for Thiago Silva
# ---
import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

year = dt.datetime.now(ZoneInfo("America/Manaus")).year
payload = json.loads(Path("data/reference.json").read_text(encoding="utf8"))
payload["currentYear"] = year
calendar = [(dt.date(2001, 1, 1) + dt.timedelta(days=i)).strftime("%m-%d") for i in range(365)]
for station in payload["stations"]:
    code = station["code"]
    dated = {}
    for file in sorted((Path("data") / code).glob("*.json")):
        records = json.loads(file.read_text())
        dated.update(records)
        if code == "31645000" and file.stem not in station["years"]:
            station["years"][file.stem] = [records.get(f"{file.stem}-{day}") for day in calendar]
    station["years"][str(year)] = [dated.get(f"{year}-{day}") for day in calendar]
    latest = max(dated)
    station.update(latest=latest, latestLevel=dated[latest])
    for days in [1, 7]:
        earlier = (dt.date.fromisoformat(latest) - dt.timedelta(days=days)).isoformat()
        station[f"change{days}d"] = dated[latest] - dated[earlier] if earlier in dated else None
    print(f"{code}: latest level on {latest}")
out = Path("site/views/v2_prototype.js")
out.write_text("window.MONITOR_V2_DATA = " + json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + ";\n",encoding="utf8")
