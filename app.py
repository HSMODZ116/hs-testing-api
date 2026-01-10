from flask import Flask, request, jsonify
import requests
import json
import re

app = Flask(__name__)

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": True,
        "message": "Phone lookup API",
        "endpoint": "/lookup?num=PHONE_NUMBER",
        "developer": "Haseeb Sahil"
    })

@app.route('/lookup', methods=['GET'])
def get_name_from_number():
    num = request.args.get('num', '').strip()

    if not num:
        return jsonify({
            "status": False,
            "message": "num parameter missing",
            "developer": "Haseeb Sahil"
        }), 400

    # clean number
    num = re.sub(r"[^0-9]", "", num)
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
        # Suppress SSL warnings for development (not recommended for production)
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        res = requests.get(url, headers=headers, timeout=15, verify=False)
        data = res.json()
    except Exception as e:
        return jsonify({
            "status": False,
            "message": f"Source API error: {str(e)}",
            "developer": "Haseeb Sahil"
        }), 500

    if not data:
        return jsonify({
            "status": False,
            "message": "No data found",
            "developer": "Haseeb Sahil"
        }), 404

    data["developer"] = "Haseeb Sahil"
    data["source"] = "hidden"

    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True)