import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc,
  arrayUnion
  // Если захочешь серверное время:
  // , serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNk1We9du5BJyrgGbQrkqd7tSDscneIOA",
  authDomain: "gold-11fa4.firebaseapp.com",
  projectId: "gold-11fa4",
  storageBucket: "gold-11fa4.firebasestorage.app",
  messagingSenderId: "226774330161",
  appId: "1:226774330161:web:d1e1c93ade5dcea31d5e10",
  measurementId: "G-7MLLBN1YZ4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ===== helpers =====
const $ = (id) => document.getElementById(id);
const has = (id) => !!$(id);
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

const esc = (v = "") =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function todayLocalYYYYMMDD() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split("T")[0];
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ===== state =====
let DEFAULTS = { income: [], expense: [] };
let ACCOUNTS = [];
let allTx = [];

// Старые функции (если где-то в других файлах используются)
window.fbDB = db;
window.fbMethods = { collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, arrayUnion };

// ===== init =====
function initApp() {
  const setRef = collection(db, "settings");
  const txRef = collection(db, "transactions");

  // поставить сегодняшнюю дату в форме
  if (has("date")) $("date").value = todayLocalYYYYMMDD();

  // Один раз вешаем обработчики UI
  bindUIHandlers();
  bindFormHandler(txRef);

  // Загрузка настроек
  onSnapshot(setRef, (snap) => {
    DEFAULTS = { income: [], expense: [] };
    ACCOUNTS = [];

    let setHtml = "";

    snap.forEach((d) => {
      const data = d.data() || {};
      const id = d.id;

      if (data.type === "category") {
        const ct = (data.catType === "income" || data.catType === "expense") ? data.catType : "expense";
        DEFAULTS[ct].push({ id, ...data });

        const subs = Array.isArray(data.sub) ? data.sub : [];
        setHtml += `
          <div class="set-item">
            📂 ${esc(data.name)} (${ct === "income" ? "+" : "-"})
            <button onclick="deleteSet('${esc(id)}')">✕</button>
            <div style="font-size:10px; color:#666;">${esc(subs.join(", "))}</div>
          </div>`;
      }

      if (data.type === "account") {
        ACCOUNTS.push({ id, ...data });
        setHtml += `
          <div class="set-item">
            💳 ${esc(data.name)}
            <button onclick="deleteSet('${esc(id)}')">✕</button>
          </div>`;
      }
    });

    setHTML("settingsList", setHtml);
    updateUI(); // обновить селекты/подкатегории
  });

  // Загрузка транзакций
  onSnapshot(query(txRef, orderBy("date", "desc")), (snap) => {
    allTx = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        amount: num(data.amount),
        date: String(data.date || ""), // ожидаем "YYYY-MM-DD"
        time: String(data.time || ""),
        type: String(data.type || ""),
        categoryName: String(data.categoryName || ""),
        subcategory: String(data.subcategory || ""),
        account: String(data.account || ""),
        comment: String(data.comment || "")
      };
    });

    // если фильтр не выставлен — ставим today
    if (has("fromDate") && has("toDate") && !$("fromDate").value && window.setRange) {
      window.setRange("today");
    } else {
      render();
    }
  });
}

// ===== UI logic =====
function bindUIHandlers() {
  const elT = $("type");
  const elC = $("category");
  if (elT) elT.onchange = updateUI;
  if (elC) elC.onchange = fillSubs;
  if (has("fromDate")) $("fromDate").onchange = render;
  if (has("toDate")) $("toDate").onchange = render;
}

function updateUI() {
  const elT = $("type");
  const elC = $("category");
  const elS = $("subcategory");
  const elAcc = $("accountSelect");

  // accounts
  if (elAcc) {
    const accOptions = ACCOUNTS.length
      ? ACCOUNTS.map((a) => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join("")
      : `<option value="">Счет не выбран</option>`;
    elAcc.innerHTML = accOptions;
  }

  if (!elT || !elC) return;

  const key = (elT.value === "income" || elT.value === "expense") ? elT.value : "expense";
  const currentCats = DEFAULTS[key] || [];

  elC.innerHTML = currentCats.length
    ? currentCats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")
    : `<option value="">Без категорий</option>`;

  // parent category select for adding subcategory
  const parentCatSelect = $("setParentCat");
  if (parentCatSelect) {
    const allCats = [...DEFAULTS.income, ...DEFAULTS.expense];
    parentCatSelect.innerHTML = allCats.length
      ? allCats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")
      : `<option value="">Нет категорий</option>`;
  }

  fillSubs(); // обновим подкатегории под текущую категорию
}

function fillSubs() {
  const elT = $("type");
  const elC = $("category");
  const elS = $("subcategory");
  const wrap = $("subcatWrap");

  if (!elT || !elC || !elS || !wrap) return;

  const key = (elT.value === "income" || elT.value === "expense") ? elT.value : "expense";
  const currentCats = DEFAULTS[key] || [];
  const cat = currentCats.find((c) => c.id === elC.value);

  const subs = cat && Array.isArray(cat.sub) ? cat.sub : [];

  if (subs.length > 0) {
    wrap.classList.remove("hidden");
    elS.innerHTML = subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  } else {
    wrap.classList.add("hidden");
    elS.innerHTML = "";
  }
}

function bindFormHandler(txRef) {
  const form = $("txForm");
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();

    const amt = num($("amount")?.value);
    if (!amt) return;

    const type = $("type")?.value === "income" ? "income" : "expense";
    const catId = $("category")?.value || "";
    const cats = [...DEFAULTS.income, ...DEFAULTS.expense];
    const catObj = cats.find((c) => c.id === catId);

    const dateVal = $("date")?.value || todayLocalYYYYMMDD();
    const accountVal = $("accountSelect")?.value || "";
    const subVal = $("subcategory")?.value || "";
    const commentVal = $("comment")?.value || "";

    await addDoc(txRef, {
      type,
      amount: amt,
      categoryName: catObj ? String(catObj.name || "") : "Без категории",
      subcategory: String(subVal || ""),
      account: String(accountVal || ""),
      date: String(dateVal),
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      createdAt: Date.now(),
      // createdAt: serverTimestamp(), // если включишь импорт serverTimestamp
      comment: String(commentVal || "")
    });

    if (has("amount")) $("amount").value = "";
    if (has("comment")) $("comment").value = "";
    if (has("date")) $("date").value = todayLocalYYYYMMDD();
  };
}

// ===== Settings functions (global) =====
window.addCategory = async () => {
  const name = $("setCatName")?.value?.trim();
  const catType = $("setCatType")?.value;
  const ct = (catType === "income" || catType === "expense") ? catType : "expense";
  if (!name) return;

  await addDoc(collection(db, "settings"), { type: "category", name, catType: ct, sub: [] });
  if (has("setCatName")) $("setCatName").value = "";
};

window.addAccount = async () => {
  const name = $("setAccName")?.value?.trim();
  if (!name) return;

  await addDoc(collection(db, "settings"), { type: "account", name });
  if (has("setAccName")) $("setAccName").value = "";
};

window.addSub = async () => {
  const parentId = $("setParentCat")?.value;
  const subName = $("setSubName")?.value?.trim();
  if (!parentId || !subName) return;

  await updateDoc(doc(db, "settings", parentId), {
    sub: arrayUnion(subName)
  });

  if (has("setSubName")) $("setSubName").value = "";
};

window.deleteSet = async (id) => {
  if (!id) return;
  if (confirm("Удалить пункт настроек?")) await deleteDoc(doc(db, "settings", id));
};

window.deleteTx = async (id) => {
  if (!id) return;
  if (confirm("Удалить запись из истории?")) await deleteDoc(doc(db, "transactions", id));
};

window.setRange = (mode) => {
  const f = $("fromDate"), t = $("toDate");
  if (!f || !t) return;

  const today = todayLocalYYYYMMDD();

  if (mode === "today") {
    f.value = today; t.value = today;
  } else if (mode === "yesterday") {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const y = new Date(now - offset);
    y.setDate(y.getDate() - 1);
    const yStr = y.toISOString().split("T")[0];
    f.value = yStr; t.value = yStr;
  } else {
    f.value = ""; t.value = "";
  }

  render();
};

// ===== Render =====
function render() {
  const from = $("fromDate")?.value || "";
  const to = $("toDate")?.value || "";

  const filtered = allTx.filter((t) =>
    (!from || t.date >= from) && (!to || t.date <= to)
  );

  const inc = filtered
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + num(t.amount), 0);

  const exp = filtered
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + num(t.amount), 0);

  // бензин (умный поиск)
  const gas = filtered
    .filter((t) => {
      if (t.type !== "expense") return false;
      const s = (t.subcategory || "").toLowerCase();
      const c = (t.categoryName || "").toLowerCase();
      return s.includes("бенз") || c.includes("бенз");
    })
    .reduce((s, t) => s + num(t.amount), 0);

  setText("balance", `${(inc - exp).toLocaleString()} ₸`);
  setText("totalIncome", `${inc.toLocaleString()} ₸`);
  setText("totalExpense", `${exp.toLocaleString()} ₸`);

  // баланс по счетам
  if (has("accountBalances")) {
    const accs = {};
    filtered.forEach((t) => {
      const acc = t.account || "Без счета";
      if (!accs[acc]) accs[acc] = 0;
      accs[acc] += (t.type === "income" ? num(t.amount) : -num(t.amount));
    });

    setHTML("accountBalances",
      Object.entries(accs)
        .map(([n, v]) =>
          `<span>${esc(n)}: <b style="color:${v >= 0 ? "#65d48b" : "#ff6b6b"}">${v.toLocaleString()}</b></span>`
        )
        .join(" | ")
    );
  }

  // полоска бензина
  if (has("gasText")) {
    const gasP = inc > 0 ? (gas / inc) * 100 : 0;
    setText("gasText", `Бензин: ${gasP.toFixed(1)}% (${gas.toLocaleString()} ₸)`);

    const fill = $("gasFill");
    if (fill) fill.style.width = `${clamp(gasP * 3, 0, 100)}%`;
  }

  // статистика дохода
  if (has("earningsDetails")) {
    const statsInc = {};
    filtered.filter((t) => t.type === "income").forEach((t) => {
      const key = t.subcategory || t.categoryName || "Без категории";
      if (!statsInc[key]) statsInc[key] = { sum: 0, cnt: 0, br: {} };
      statsInc[key].sum += num(t.amount);
      statsInc[key].cnt++;
      const p = String(num(t.amount));
      statsInc[key].br[p] = (statsInc[key].br[p] || 0) + 1;
    });

    setHTML("earningsDetails",
      Object.entries(statsInc).map(([k, d]) => `
        <div class="stat-row">
          <div class="stat-main">
            <span>${esc(k)} (${d.cnt})</span>
            <b>${d.sum.toLocaleString()} ₸</b>
          </div>
          <div class="stat-sub">
            ${Object.entries(d.br).map(([p, c]) => `${esc(p)}₸×${c}`).join(" | ")}
          </div>
        </div>
      `).join("")
    );
  }

  // ВОЗМОЖНЫЙ ДОХОД (ВД) - лимит 3000
  if (has("potentialStats")) {
    let totalGain = 0;
    const vdStats = {};
    const vds = ["F1", "F2", "F3", "Ночь"];

    filtered.forEach((t) => {
      if (t.type !== "income") return;
      if (!vds.includes(t.subcategory)) return;
      if (num(t.amount) >= 3000) return;

      const sub = t.subcategory;
      if (!vdStats[sub]) vdStats[sub] = { vdSum: 0 };

      let p = num(t.amount);
      if (p === 150) p = 600;
      else if (p === 300) p = 900;
      else if (sub === "Ночь" && p === 500) p = 1000;

      vdStats[sub].vdSum += p;
    });

    const statsIncNow = {};
    filtered.filter((t) => t.type === "income").forEach((t) => {
      const key = t.subcategory || t.categoryName || "Без категории";
      if (!statsIncNow[key]) statsIncNow[key] = 0;
      statsIncNow[key] += num(t.amount);
    });

    let vdHtml = Object.entries(vdStats).map(([p, data]) => {
      const rSum = statsIncNow[p] || 0;
      const diff = data.vdSum - rSum;
      totalGain += diff;

      return `
        <div class="stat-row">
          <div class="stat-main">
            <span>${esc(p)}</span>
            <b>${data.vdSum.toLocaleString()} ₸</b>
          </div>
          <div style="color:#65d48b; font-size:12px;">
            Выгода: +${diff.toLocaleString()} ₸
          </div>
        </div>
      `;
    }).join("");

    if (!vdHtml) vdHtml = `<div class="muted">Нет данных ВД</div>`;
    if (totalGain > 0) vdHtml += `
      <div class="gain-box">
        <span>ВЫГОДА ВД:</span>
        <span class="pos">+${totalGain.toLocaleString()} ₸</span>
      </div>`;

    setHTML("potentialStats", vdHtml);
  }

  // расходы
  if (has("expenseDetails")) {
    const statsExp = {};
    filtered.filter((t) => t.type === "expense").forEach((t) => {
      const cat = t.categoryName || "Без категории";
      if (!statsExp[cat]) statsExp[cat] = { sum: 0, subs: {} };
      statsExp[cat].sum += num(t.amount);

      if (t.subcategory) {
        const s = t.subcategory;
        statsExp[cat].subs[s] = (statsExp[cat].subs[s] || 0) + num(t.amount);
      }
    });

    setHTML("expenseDetails",
      Object.entries(statsExp).map(([c, d]) => `
        <div class="stat-row">
          <div class="stat-main">
            <span>${esc(c)}</span>
            <b class="neg">${d.sum.toLocaleString()} ₸</b>
          </div>
          <div class="stat-sub">
            ${Object.entries(d.subs).map(([s, v]) => `${esc(s)}: ${v.toLocaleString()}`).join(" | ")}
          </div>
        </div>
      `).join("")
    );
  }

  // история
  if (has("list")) {
    setHTML("list",
      filtered.map((t) => `
        <div class="item">
          <div>
            <b class="${t.type === "income" ? "pos" : "neg"}">${num(t.amount).toLocaleString()} ₸</b><br>
            <small class="muted">${esc(t.time)} | ${esc(t.subcategory || t.categoryName)} [${esc(t.account)}]</small>
            ${t.comment ? `<div style="color:#65d48b; font-size:12px;">📝 ${esc(t.comment)}</div>` : ""}
          </div>
          <button onclick="deleteTx('${esc(t.id)}')" style="background:none;border:none;color:#444;padding:10px;cursor:pointer;">✕</button>
        </div>
      `).join("")
    );
  }
}

// Запуск
initApp();
window.render = render;