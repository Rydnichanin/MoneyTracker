import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  doc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ====== CONFIG ======
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

// Если где-то в проекте есть старые скрипты — оставим совместимость:
window.fbDB = db;
window.fbMethods = { collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc };

// ====== DEFAULTS (как у тебя) ======
const DEFAULTS = {
  income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
  expense: [
    { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка"] },
    { id: "drinks", name: "Напитки", sub: [] },
    { id: "clothes", name: "Одежда", sub: [] },
    { id: "home", name: "Дом/быт", sub: [] },
    { id: "food", name: "Еда", sub: [] },
    { id: "other", name: "Прочее", sub: [] }
  ]
};

let allTransactions = [];

// ====== helpers ======
const $ = (id) => document.getElementById(id);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const safeText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const safeHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

function todayYYYYMMDD() {
  // локальная дата без сдвига на UTC
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split("T")[0];
}

// ====== init ======
function initApp() {
  const colRef = collection(db, "transactions");

  const elT = $("type");
  const elC = $("category");
  const elS = $("subcategory");
  const sw = $("subcatWrap");
  const elDate = $("date");
  const form = $("txForm");

  if (!elT || !elC || !elS || !sw || !elDate || !form) {
    console.error("Не найдены элементы формы. Проверь ids: type, category, subcategory, subcatWrap, date, txForm");
    return;
  }

  elDate.value = todayYYYYMMDD();

  const fillSubs = () => {
    const cat = DEFAULTS[elT.value]?.find(i => i.id === elC.value);
    if (cat && Array.isArray(cat.sub) && cat.sub.length > 0) {
      sw.classList.remove("hidden");
      elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join("");
    } else {
      sw.classList.add("hidden");
      elS.innerHTML = "";
    }
  };

  const fillCats = () => {
    const cats = DEFAULTS[elT.value] || [];
    elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
    fillSubs();
  };

  elT.onchange = fillCats;
  elC.onchange = fillSubs;
  fillCats();

  if ($("fromDate")) $("fromDate").oninput = render;
  if ($("toDate")) $("toDate").oninput = render;

  onSnapshot(query(colRef, orderBy("date", "desc")), (snap) => {
    allTransactions = snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        amount: num(data.amount),
        date: String(data.date || "")
      };
    });
    render();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();

    const amt = num($("amount")?.value);
    if (!amt) return;

    const catObj = (DEFAULTS[elT.value] || []).find(i => i.id === elC.value);

    await addDoc(colRef, {
      type: elT.value,
      amount: amt,
      categoryName: catObj ? catObj.name : "Без категории",
      subcategory: elS.value || "",
      date: elDate.value || todayYYYYMMDD(),
      createdAt: Date.now()
    });

    if ($("amount")) $("amount").value = "";
  };
}

// ====== render ======
function render() {
  const from = $("fromDate")?.value || "";
  const to = $("toDate")?.value || "";

  const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

  const realInc = filtered.filter(t => t.type === "income").reduce((s, t) => s + num(t.amount), 0);
  const realExp = filtered.filter(t => t.type === "expense").reduce((s, t) => s + num(t.amount), 0);

  const gasExp = filtered
    .filter(t => t.type === "expense" && String(t.subcategory || "").toLowerCase().includes("бенз"))
    .reduce((s, t) => s + num(t.amount), 0);

  safeText("balance", (realInc - realExp).toLocaleString() + " ₸");
  safeText("totalIncome", realInc.toLocaleString() + " ₸");
  safeText("totalExpense", realExp.toLocaleString() + " ₸");

  const gasPercNum = realInc > 0 ? (gasExp / realInc) * 100 : 0;
  safeText("gasText", `Бензин к доходу: ${gasPercNum.toFixed(1)}% (${gasExp.toLocaleString()} ₸)`);
  const gf = $("gasFill");
  if (gf) gf.style.width = Math.min(gasPercNum * 3, 100) + "%";

  // История
  if ($("list")) {
    safeHTML("list", filtered.map(t => `
      <div class="item">
        <div>
          <b class="${t.type === "income" ? "pos" : "neg"}">${num(t.amount).toLocaleString()} ₸</b><br>
          <small class="muted">${t.date} | ${t.subcategory || t.categoryName}</small>
        </div>
        <button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;cursor:pointer;">✕</button>
      </div>
    `).join(""));
  }
}

window.render = render;

window.deleteTx = async (id) => {
  if (!id) return;
  if (confirm("Удалить?")) {
    await deleteDoc(doc(db, "transactions", id));
  }
};

// ====== start after DOM is ready ======
document.addEventListener("DOMContentLoaded", initApp);