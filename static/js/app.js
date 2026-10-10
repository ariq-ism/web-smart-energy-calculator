(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DEFAULT_RATE = parseFloat(document.body.dataset.defaultRate) || 1444.7;
  const STORE_KEY = "smart-energy-calculator.v1";

  const SAMPLE_APPLIANCES = [
    { name: "Kipas angin", watts: 45, hours: 10 },
    { name: "Kulkas", watts: 150, hours: 24 },
    { name: "TV LED", watts: 100, hours: 4 },
    { name: "Laptop", watts: 50, hours: 6 },
    { name: "Lampu LED", watts: 10, hours: 5 },
  ];

  let appliances = SAMPLE_APPLIANCES.map((a) => ({ ...a }));

  const fmtRp = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
  const fmtKwh = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 }) + " kWh";
  const fmtNum = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 });

  // ---------- Penyimpanan lokal (opsional, tidak error jika diblokir) ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        appliances,
        rate: $("rate-list").value,
        tariff: $("tariff").value,
        days: $("days").value,
        limit: $("limit").value,
        ppj: $("ppj").value,
      }));
    } catch (e) { /* abaikan */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Array.isArray(s.appliances)) {
        appliances = s.appliances
          .filter((a) => a && typeof a.name === "string" && a.watts > 0 && a.hours > 0 && a.hours <= 24)
          .slice(0, 50)
          .map((a) => ({ name: a.name.slice(0, 50), watts: Number(a.watts), hours: Number(a.hours) }));
      }
      if (s.rate > 0) setRate(s.rate);
      if (s.tariff && [...$("tariff").options].some((o) => o.value === s.tariff)) $("tariff").value = s.tariff;
      if (s.days >= 1 && s.days <= 31) $("days").value = s.days;
      if (s.limit > 0) $("limit").value = s.limit;
      if (s.ppj >= 0 && s.ppj <= 100) $("ppj").value = s.ppj;
    } catch (e) { /* abaikan data rusak */ }
  }

  // ---------- Util UI ----------
  function showError(msg) {
    const el = $("error");
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  function setRate(value) {
    document.querySelectorAll(".rate-input").forEach((i) => { i.value = value; });
  }

  // ---------- Tab ----------
  document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab));
    showError("");
  }));

  // ---------- Tarif ----------
  setRate(DEFAULT_RATE);
  document.querySelectorAll(".rate-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      document.querySelectorAll(".rate-input").forEach((o) => { if (o !== inp) o.value = inp.value; });
      $("tariff").value = "custom";
      save();
    });
  });
  $("tariff").addEventListener("change", (e) => {
    const rate = e.target.selectedOptions[0].dataset.rate;
    if (rate) setRate(rate);
    save();
  });
  ["days", "limit", "ppj"].forEach((id) => $(id).addEventListener("input", save));

  // ---------- Daftar perangkat (textContent -> aman dari injeksi HTML) ----------
  function renderList() {
    const ul = $("appliance-list");
    ul.innerHTML = "";
    if (!appliances.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Belum ada perangkat. Tambahkan di bawah.";
      ul.appendChild(li);
      return;
    }
    appliances.forEach((a, i) => {
      const li = document.createElement("li");
      li.innerHTML = '<div class="ico">🔌</div><div class="info"><div class="name"></div><div class="meta"></div></div>';
      li.querySelector(".name").textContent = a.name;
      li.querySelector(".meta").textContent = `${fmtNum(a.watts)}W × ${fmtNum(a.hours)} jam/hari`;
      const del = document.createElement("button");
      del.className = "del";
      del.title = "Hapus";
      del.setAttribute("aria-label", "Hapus " + a.name);
      del.textContent = "🗑";
      del.addEventListener("click", () => { appliances.splice(i, 1); renderList(); save(); });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function addAppliance() {
    const name = $("a-name").value.trim();
    const watts = parseFloat($("a-watts").value);
    const hours = parseFloat($("a-hours").value);
    if (!name) return showError("Nama alat wajib diisi.");
    if (!(watts > 0)) return showError("Daya (watt) harus lebih dari 0.");
    if (!(hours > 0 && hours <= 24)) return showError("Lama pakai harus antara 0 dan 24 jam per hari.");
    if (appliances.length >= 50) return showError("Maksimal 50 perangkat.");
    showError("");
    appliances.push({ name, watts, hours });
    ["a-name", "a-watts", "a-hours"].forEach((id) => { $(id).value = ""; });
    $("a-name").focus();
    renderList();
    save();
  }

  $("add-btn").addEventListener("click", addAppliance);
  ["a-name", "a-watts", "a-hours"].forEach((id) =>
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") addAppliance(); }));
  $("clear-list").addEventListener("click", () => { appliances = []; renderList(); save(); });
  $("reset-list").addEventListener("click", () => {
    appliances = SAMPLE_APPLIANCES.map((a) => ({ ...a }));
    renderList();
    save();
  });

  // ---------- Hitung (memanggil backend Python) ----------
  async function calculate(items, rateInputId) {
    showError("");
    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appliances: items,
          rate: $(rateInputId).value,
          days: $("days").value,
          limit_kwh: $("limit").value,
          ppj: $("ppj").value,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        $("result").style.display = "none";
        return showError(data.error || "Terjadi kesalahan.");
      }
      showResult(data);
    } catch (e) {
      showError("Tidak bisa terhubung ke server. Pastikan aplikasi Python berjalan.");
    }
  }

  function showResult(d) {
    $("result").style.display = "block";
    const icon = d.alert.level === "ok" ? "✅ " : d.alert.level === "warning" ? "⚠️ " : "🚨 ";
    const alertEl = $("alert");
    alertEl.className = "alert " + d.alert.level;
    alertEl.textContent = icon + d.alert.message;

    $("r-daily").textContent = fmtKwh(d.total_daily_kwh);
    $("r-monthly").textContent = fmtKwh(d.total_monthly_kwh);
    $("r-dcost").textContent = fmtRp(d.daily_cost);
    $("r-sub").textContent = fmtRp(d.subtotal);
    $("r-total").textContent = fmtRp(d.total_cost);
    $("r-total-label").textContent = d.ppj_percent > 0
      ? `Estimasi biaya per ${d.days} hari (termasuk PPJ ${d.ppj_percent}%)`
      : `Estimasi biaya per ${d.days} hari`;
    $("r-usage-label").textContent = `Pemakaian ${d.usage_percent}% dari batas ${d.limit_kwh} kWh/bulan`;

    const bar = $("r-bar");
    bar.className = "bar " + d.alert.level;
    bar.firstElementChild.style.width = Math.min(d.usage_percent, 100) + "%";

    const body = $("r-body");
    body.innerHTML = "";
    d.items.forEach((it) => {
      const tr = document.createElement("tr");
      [it.name, fmtNum(it.daily_kwh), fmtNum(it.monthly_kwh), fmtRp(it.monthly_cost), it.share + "%"].forEach((text) => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  $("calc-basic").addEventListener("click", () => {
    calculate([{ name: $("b-name").value, watts: $("b-watts").value, hours: $("b-hours").value }], "rate-basic");
  });
  $("calc-list").addEventListener("click", () => calculate(appliances, "rate-list"));

  // ---------- Mulai ----------
  load();
  renderList();
})();
