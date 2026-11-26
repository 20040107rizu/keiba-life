"""Publish rules for the existing default Firestore database."""
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

project = os.environ["FIREBASE_PROJECT"]
if project != "keiba-life":
    raise SystemExit("Unexpected Firebase project")
token = os.environ["FIREBASE_ACCESS_TOKEN"]
base = "https://firebaserules.googleapis.com/v1/"
release = f"projects/{project}/releases/cloud.firestore"

def request(path, method="GET", data=None):
    req = Request(
        base + path, method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=None if data is None else json.dumps(data).encode(),
    )
    try:
        with urlopen(req, timeout=45) as response:
            return json.load(response)
    except HTTPError as error:
        raise SystemExit(f"Firebase Rules API failed: {error.code} {error.read().decode()}")

current = request(release)
files = [{"name": "firestore.rules", "content": Path("firestore.rules").read_text()}]
if request(current["rulesetName"]).get("source", {}).get("files") == files:
    print("Firestore already serves these rules.")
else:
    ruleset = request(f"projects/{project}/rulesets", "POST", {"source": {"files": files}})
    updated = request(release, "PATCH", {"release": {"name": release, "rulesetName": ruleset["name"]}})
    if updated["rulesetName"] != ruleset["name"]:
        raise SystemExit("The active ruleset does not match the uploaded rules.")
    print("Firestore rules published.")
