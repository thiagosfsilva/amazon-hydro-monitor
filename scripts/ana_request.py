# ---
# project: amazon-hydro-monitor
# purpose: Read authenticated ANA API responses
# author: OpenAI Codex for Thiago Silva
# ---
import http.client
import json
from urllib.parse import urlencode

def request(route, headers, query=None):
    path = "/hidrowebservice/EstacoesTelemetricas/" + route
    if query:
        path += "?" + urlencode(query)
    connection = http.client.HTTPSConnection("www.ana.gov.br", timeout=45)
    try:
        connection.request("GET", path, headers=headers)
        response = connection.getresponse()
        print(f"{route}: HTTP {response.status}", flush=True)
        if response.status != 200:
            raise RuntimeError(f"ANA returned HTTP {response.status}")
        return json.load(response)["items"]
    finally:
        connection.close()



