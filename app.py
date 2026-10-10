"""Smart Energy Calculator - backend Flask.

Menghitung konsumsi listrik (kWh), estimasi biaya, dan peringatan batas pemakaian.

Menjalankan:
    python app.py
lalu buka http://127.0.0.1:5000

Opsi lewat environment variable:
    HOST (default 127.0.0.1)   PORT (default 5000)   FLASK_DEBUG=1 untuk mode debug
"""
import os

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024  # batasi ukuran request (64 KB)
app.config["JSON_AS_ASCII"] = False

# Tarif listrik rumah tangga PLN (Rp/kWh). Nilai bisa berubah, selalu cek info resmi PLN.
TARIFFS = [
    {"id": "r1_900", "label": "R-1 900 VA (non-subsidi)", "rate": 1352.00},
    {"id": "r1_1300", "label": "R-1/TR 1.300 VA", "rate": 1444.70},
    {"id": "r1_2200", "label": "R-1/TR 2.200 VA", "rate": 1444.70},
    {"id": "r2", "label": "R-2/TR 3.500 - 5.500 VA", "rate": 1699.53},
    {"id": "custom", "label": "Kustom (isi sendiri)", "rate": None},
]

DEFAULTS = {
    "rate": 1444.70,      # Rp per kWh
    "days": 30,           # hari pemakaian per bulan
    "limit_kwh": 150.0,   # batas konsumsi per bulan
    "ppj": 0.0,           # Pajak Penerangan Jalan (%), berbeda tiap daerah
}

MAX_APPLIANCES = 50


class ValidationError(Exception):
    pass


def format_rupiah_rate(value):
    """1444.7 -> '1.444,70' (format Indonesia)."""
    text = f"{value:,.2f}"
    return text.replace(",", "X").replace(".", ",").replace("X", ".")


def to_number(value, label, minimum=None, maximum=None, allow_equal_min=True):
    if isinstance(value, bool):
        raise ValidationError(f"{label} harus berupa angka.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{label} harus berupa angka.")
    if number != number or number in (float("inf"), float("-inf")):
        raise ValidationError(f"{label} tidak valid.")
    if minimum is not None:
        if not allow_equal_min and number <= minimum:
            raise ValidationError(f"{label} harus lebih besar dari {minimum:g}.")
        if allow_equal_min and number < minimum:
            raise ValidationError(f"{label} minimal {minimum:g}.")
    if maximum is not None and number > maximum:
        raise ValidationError(f"{label} maksimal {maximum:g}.")
    return number


def calculate(appliances, rate, days, limit_kwh, ppj):
    if not appliances:
        raise ValidationError("Tambahkan minimal satu perangkat.")
    if len(appliances) > MAX_APPLIANCES:
        raise ValidationError(f"Maksimal {MAX_APPLIANCES} perangkat.")

    rate = to_number(rate, "Tarif listrik", 0, 100000, allow_equal_min=False)
    days = to_number(days, "Hari pemakaian", 1, 31)
    limit_kwh = to_number(limit_kwh, "Batas konsumsi", 0, 1000000, allow_equal_min=False)
    ppj = to_number(ppj, "PPJ", 0, 100)

    items = []
    total_daily = 0.0
    for index, raw in enumerate(appliances, start=1):
        name = str(raw.get("name", "")).strip()
        if not name:
            raise ValidationError(f"Nama perangkat ke-{index} wajib diisi.")
        if len(name) > 50:
            raise ValidationError(f"Nama perangkat ke-{index} terlalu panjang (maks. 50 karakter).")
        watts = to_number(raw.get("watts"), f"Daya {name}", 0, 100000, allow_equal_min=False)
        hours = to_number(raw.get("hours"), f"Lama pakai {name}", 0, 24, allow_equal_min=False)

        daily_kwh = watts * hours / 1000
        monthly_kwh = daily_kwh * days
        items.append({
            "name": name,
            "watts": watts,
            "hours": hours,
            "daily_kwh": daily_kwh,
            "monthly_kwh": monthly_kwh,
            "monthly_cost": monthly_kwh * rate,
        })
        total_daily += daily_kwh

    total_monthly = total_daily * days
    subtotal = total_monthly * rate
    ppj_cost = subtotal * ppj / 100
    total_cost = subtotal + ppj_cost

    for item in items:
        share = (item["monthly_kwh"] / total_monthly * 100) if total_monthly else 0
        item["share"] = round(share, 1)
        item["daily_kwh"] = round(item["daily_kwh"], 3)
        item["monthly_kwh"] = round(item["monthly_kwh"], 3)
        item["monthly_cost"] = round(item["monthly_cost"])

    usage_percent = total_monthly / limit_kwh * 100
    top = max(items, key=lambda i: i["monthly_kwh"])

    if usage_percent > 100:
        level = "danger"
        message = (f"Peringatan! Konsumsi {total_monthly:.2f} kWh/bulan melebihi batas "
                   f"{limit_kwh:g} kWh ({usage_percent:.0f}% dari batas). "
                   f"Pemakai terbesar: {top['name']} ({top['share']:.0f}%). "
                   f"Coba kurangi jam pakainya.")
    elif usage_percent >= 80:
        level = "warning"
        message = (f"Hati-hati, konsumsi sudah {usage_percent:.0f}% dari batas {limit_kwh:g} kWh/bulan. "
                   f"Pemakai terbesar: {top['name']} ({top['share']:.0f}%).")
    else:
        level = "ok"
        message = f"Aman. Konsumsi {usage_percent:.0f}% dari batas {limit_kwh:g} kWh/bulan."

    return {
        "items": items,
        "days": days,
        "rate": rate,
        "total_daily_kwh": round(total_daily, 3),
        "total_monthly_kwh": round(total_monthly, 3),
        "daily_cost": round(total_daily * rate),
        "subtotal": round(subtotal),
        "ppj_percent": ppj,
        "ppj_cost": round(ppj_cost),
        "total_cost": round(total_cost),
        "limit_kwh": limit_kwh,
        "usage_percent": round(usage_percent, 1),
        "alert": {"level": level, "message": message},
    }


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        "frame-ancestors 'none'"
    )
    return response


@app.route("/")
def index():
    tariffs = [dict(t, rate_text=format_rupiah_rate(t["rate"]) if t["rate"] is not None else "")
               for t in TARIFFS]
    return render_template("index.html", tariffs=tariffs, defaults=DEFAULTS)


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Permintaan tidak valid."}), 400
    appliances = data.get("appliances")
    if not isinstance(appliances, list) or not all(isinstance(a, dict) for a in appliances):
        return jsonify({"error": "Data perangkat tidak valid."}), 400
    try:
        result = calculate(
            appliances,
            data.get("rate", DEFAULTS["rate"]),
            data.get("days", DEFAULTS["days"]),
            data.get("limit_kwh", DEFAULTS["limit_kwh"]),
            data.get("ppj", DEFAULTS["ppj"]),
        )
    except ValidationError as err:
        return jsonify({"error": str(err)}), 400
    return jsonify(result)


@app.errorhandler(404)
def not_found(_):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint tidak ditemukan."}), 404
    return "Halaman tidak ditemukan. Kembali ke beranda: /", 404


@app.errorhandler(413)
def too_large(_):
    return jsonify({"error": "Data terlalu besar."}), 413


@app.errorhandler(405)
def bad_method(_):
    return jsonify({"error": "Metode tidak diizinkan."}), 405


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    print(f"Smart Energy Calculator berjalan di http://{host}:{port}  (Ctrl+C untuk berhenti)")
    if os.environ.get("FLASK_DEBUG") == "1":
        app.run(host=host, port=port, debug=True)
    else:
        try:
            from waitress import serve  # server produksi, tersedia di requirements.txt
        except ImportError:
            app.run(host=host, port=port)
        else:
            serve(app, host=host, port=port)
