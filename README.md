# Smart Energy Calculator

Website untuk menghitung perkiraan konsumsi listrik (kWh), estimasi biaya, dan peringatan jika melebihi batas, untuk perangkat elektronik di rumah atau kos.

- **Backend:** Python (Flask)
- **Frontend:** HTML, CSS, JavaScript (tanpa framework)

## Cara menjalankan

Butuh Python 3.9 atau lebih baru.

**Windows:** klik dua kali `run.bat`.

**macOS / Linux:**
```bash
bash run.sh
```

**Manual:**
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Lalu buka http://127.0.0.1:5000

Agar bisa dibuka dari HP di jaringan Wi-Fi yang sama, jalankan dengan `HOST=0.0.0.0` (di Windows: `set HOST=0.0.0.0` sebelum `python app.py`), lalu buka `http://<IP-komputer>:5000`.

## Struktur proyek

```
smart-energy-calculator/
├── app.py                  # backend Flask: perhitungan, validasi, API
├── requirements.txt
├── run.bat / run.sh        # skrip sekali klik
├── templates/index.html    # halaman web
└── static/
    ├── css/style.css       # tampilan
    └── js/app.js           # logika antarmuka
```

## Cara kerja perhitungan

```
kWh per hari   = watt × jam pakai ÷ 1000
kWh per bulan  = kWh per hari × jumlah hari
Biaya          = kWh per bulan × tarif per kWh (+ PPJ jika diisi)
```

Contoh: kipas 45 W × 10 jam = 0,45 kWh/hari = 13,5 kWh/bulan, biaya sekitar Rp 19.503 (tarif Rp 1.444,70/kWh).

Peringatan: hijau di bawah 80% batas, kuning 80-100%, merah jika melebihi batas.

## Pengaturan

Tarif dan batas ada di tab **Lanjutan**. Tarif PLN di `app.py` (`TARIFFS`) adalah perkiraan dan bisa berubah, sesuaikan dengan tagihanmu. Perangkat dan pengaturan tersimpan otomatis di browser.

## API

`POST /api/calculate`

```json
{
  "appliances": [{"name": "Kipas angin", "watts": 45, "hours": 10}],
  "rate": 1444.7,
  "days": 30,
  "limit_kwh": 150,
  "ppj": 0
}
```

## Deploy

Untuk server sungguhan, jalankan lewat server WSGI, misalnya `waitress-serve --port=8000 app:app` (sudah ada di `requirements.txt`) atau `gunicorn app:app` di Linux. Jangan gunakan `FLASK_DEBUG=1` di server publik.
