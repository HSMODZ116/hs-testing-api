import json
import re
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

def normalize_pk_number(raw: str):
    """
    Accepts Pakistani numbers in many formats, e.g.
      03068060398
      923068060398
      +923068060398
      3068060398
      03xx-xxxxxxx, spaces, etc.

    Returns:
      normalized E.164: +92XXXXXXXXXX
      or None if invalid
    """
    if raw is None:
        return None

    s = str(raw).strip()
    if not s:
        return None

    # keep only digits
    digits = re.sub(r"[^\d]", "", s)

    # 030xxxxxxxx (11 digits)
    if digits.startswith("03") and len(digits) == 11:
        # drop leading 0 -> +92
        return "+92" + digits[1:]

    # 92xxxxxxxxxx (12 digits)
    if digits.startswith("92") and len(digits) == 12:
        return "+" + digits

    # 3xxxxxxxxx (10 digits) - sometimes users omit leading 0
    if digits.startswith("3") and len(digits) == 10:
        return "+92" + digits

    return None


@app.get("/")
def root():
    """
    Usage:
      /?num=03068060398
      /?num=923068060398
      /?num=+923068060398
    """
    raw = request.args.get("num", "")
    pk = normalize_pk_number(raw)

    if not pk:
        return jsonify({
            "status": False,
            "message": "Invalid Pakistani number",
            "examples": ["03068060398", "923068060398", "+923068060398"],
            "developer": "abbas"
        }), 400

    # CallApp expects URL-encoded plus
    cpn = pk.replace("+", "%2B")

    url = (
        "https://s.callapp.com/callapp-server/csrch"
        f"?cpn={cpn}&myp=fb.877409278562861&ibs=0&cid=0"
        "&tk=0080528975&cvc=2239"
    )

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; wv)",
        "Accept-Encoding": "identity",
        "Accept": "application/json"
    }

    try:
        # (Note) verify=False aapke original file me tha; isi behavior ko keep kiya.
        res = requests.get(url, headers=headers, timeout=20, verify=False)
        res.raise_for_status()

        # Some times server returns non-json; handle safely
        try:
            data = res.json()
        except Exception:
            return jsonify({
                "status": False,
                "message": "Source returned non-JSON response",
                "developer": "abbas"
            }), 502

    except requests.exceptions.Timeout:
        return jsonify({
            "status": False,
            "message": "Source API timeout",
            "developer": "abbas"
        }), 504
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

    # add your fields
    if isinstance(data, dict):
        data["developer"] = "abbas"
        data["source"] = "hidden"
        data["normalized"] = pk
    else:
        # if API returns list, wrap it
        data = {
            "result": data,
            "developer": "abbas",
            "source": "hidden",
            "normalized": pk
        }

    return app.response_class(
        response=json.dumps(data, ensure_ascii=False, indent=4),
        status=200,
        mimetype="application/json"
    )