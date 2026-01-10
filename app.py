import json
import re
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

def clean_num(num: str) -> str:
    num = (num or "").strip()
    num = re.sub(r"[^0-9]", "", num)
    return num

@app.get("/")
def root():
    """
    Usage:
      /?num=9876543210   (without +91)
    """
    num = request.args.get("num", "")
    num = clean_num(num)

    if not num:
        return jsonify({
            "status": False,
            "message": "num parameter missing",
            "developer": "abbas"
        }), 400

    cpn = "%2B91" + num

    url = (
        "https://s.callapp.com/callapp-server/csrch"
        f"?cpn={cpn}&myp=fb.877409278562861&ibs=0&cid=0"
        "&tk=0080528975&cvc=2239"
    )

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; wv)",
        "Accept-Encoding": "identity"
    }

    try:
        # NOTE: verify=False insecure hota hai, lekin aapke original code me yehi tha.
        res = requests.get(url, headers=headers, timeout=15, verify=False)
        res.raise_for_status()
        data = res.json()
    except Exception:
        return jsonify({
            "status": False,
            "message": "Source API error",
            "developer": "abbas"
        }), 502

    if not data:
        return jsonify({
            "status": False,
            "message": "No data found",
            "developer": "abbas"
        }), 404

    data["developer"] = "abbas"
    data["source"] = "hidden"
    return app.response_class(
        response=json.dumps(data, ensure_ascii=False, indent=4),
        status=200,
        mimetype="application/json"
    )

# Vercel serverless will import "app" automatically