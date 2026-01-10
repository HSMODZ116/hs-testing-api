import requests
import json
import re

def get_name_from_number():
    num = input("Enter phone number (without +91): ").strip()

    if not num:
        print(json.dumps({
            "status": False,
            "message": "num parameter missing",
            "developer": "Haseeb Sahil"
        }, indent=4))
        return

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
        res = requests.get(url, headers=headers, timeout=15, verify=False)
        data = res.json()
    except Exception:
        print(json.dumps({
            "status": False,
            "message": "Source API error",
            "developer": "Haseeb Sahil"
        }, indent=4))
        return

    if not data:
        print(json.dumps({
            "status": False,
            "message": "No data found",
            "developer": "Haseeb Sahil"
        }, indent=4))
        return

    data["developer"] = "Haseeb Sahil"
    data["source"] = "hidden"

    print(json.dumps(data, indent=4, ensure_ascii=False))


if __name__ == "__main__":
    get_name_from_number()