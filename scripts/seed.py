# ---
# project: amazon-hydro-monitor
# purpose: Import a historical monitor release and seed dated daily levels
# author: OpenAI Codex for Thiago Silva
# ---
import json
import sys
from pathlib import Path
import pandas as pd

project = Path(sys.argv[1])
data = Path("data")
export = project / "projects/monitor/views/v2_prototype.js"
payload = json.loads(export.read_text(encoding="utf8").split(" = ", 1)[1].strip().removesuffix(";"))
year = payload.pop("currentYear")
for s in payload["stations"]:
    code = s["code"]
    partition = project / "data/cache/canonical/variable=level"
    leaf = f"station_code={code}/part-0.parquet"
    def levels(source):
        df = pd.read_parquet(partition / f"source={source}" / leaf)
        return df[(df.stat == "mean") & df.value.notna() & ~df.status.isin(["duvidoso", "regua_seca"])].set_index("date").value
    telemetry = levels("telemetry")
    hist = partition / "source=hidroweb" / leaf
    counts = {}
    deviations = {}
    if hist.exists():
        h = levels("hidroweb")
        dates = pd.to_datetime(h.index)
        baseline_dates = dates[(dates.year >= 1980) & (dates.year <= 2010)]
        counts = pd.Series(baseline_dates.strftime("%m-%d")).value_counts().to_dict()
        reference = h[(dates.year >= 1980) & (dates.year <= 2010)]
        deviations = reference.groupby(baseline_dates.strftime("%m-%d")).std().dropna().to_dict()
    calendar = pd.date_range("2001-01-01", periods=365).strftime("%m-%d")
    s["baseline"]["count"] = [int(counts.get(day, 0)) for day in calendar]
    s["baseline"]["sd"] = [deviations.get(day) for day in calendar]
    dates = pd.to_datetime(telemetry.index)
    folder = data / code
    folder.mkdir(exist_ok=True)
    for y in [year-1, year]:
        rows = {str(date)[:10]: round(float(v) - (4.963 if code == "12900001" else 0), 6)
                for date, v in telemetry[dates.year == y].items()}
        (folder / f"{y}.json").write_text(json.dumps(rows, sort_keys=True, indent=1)+"\n")
    s["years"].pop(str(year))
    for key in ["latest", "latestLevel", "change1d", "change7d"]:
        s.pop(key)
(data / "reference.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),encoding="utf8")
