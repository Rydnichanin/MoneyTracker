import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, 
  query, orderBy, enableMultiTabIndexedDbPersistence, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyBYvSsrzjgkrBwhaBAt0KlCGrAtzgOPYx8",
  authDomain: "moneytracker-5335b.firebaseapp.com",
  projectId: "moneytracker-5335b",
  storageBucket: "moneytracker-5335b.firebasestorage.app",
  messagingSenderId: "440589448883",
  appId: "1:440589448883:web:5ad507b270fa414731a2c6"
};

// --- INIT ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Offline Persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => console.error("Offline err:", err));

const SETTINGS_KEY = "money_tracker_settings_main";
const DEFAULTS = {
  accounts: [{ id: "cash", name: "Наличные" }, { id: "kaspi", name: "Kaspi" }],
  categoriesByType: {
    income: [
      { id: "delivery", name: "Доставка", color: "#65d48b", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
      { id: "taxi", name: "Такси", color: "#ffd166", sub: [] }
    ],
    expense: [
      { id: "auto", name: "Автомобиль", color: "#ffd166", sub: ["Бензин", "Масла", "Фильтра", "Мойка"] },
      { id: "food", name: "Еда", color: "#ff6b6b", sub: [] },
      { id: "other", name: "Прочее", color: "#9aa0a7", sub: [] }
    ]
  },
  pinHash: null
};

let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || DEFAULTS;
let allTx = [];

// --- HELPERS ---
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtKZT = (n) => (n || 0).toLocaleString("ru-RU") + " ₸";

// --- FIREBASE OPS ---
async function addTransaction(tx) {
  try { await addDoc(collection(db, "transactions"), tx); } 
  catch (e) { console.error("Error adding document: ", e); }
}

async function deleteTransaction(id) {
  try { await deleteDoc(doc(db, "transactions", id)); } 
  catch (e) { console.error("Error deleting document: ", e); }
}

// Real-time listener
function listenToUpdates() {
  const q = query(collection(db, "transactions"), orderBy("date", "desc"));
  onSnapshot(q, (snapshot) => {
    allTx = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
}

// --- UI LOGIC ---
const elList = document.getElementById("list");
const elType = document.getElementById("type");
const elCategory = document.getElementById("category");
const elAccount = document.getElementById("account");
const subcatWrap = document.getElementById("subcatWrap");
const elSubcategory = document.getElementById("subcategory");

function renderSelects() {
  elAccount.innerHTML = settings.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  elAccount.value = "cash";
  const cats = settings.categoriesByType[elType.value] || [];
  elCategory.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  updateSubcatUI();
}

function updateSubcatUI() {
  const cat = settings.categoriesByType[elType.value].find(c => c.id === elCategory.value);
  if (cat?.sub?.length) {
    subcatWrap.classList.remove("hidden");
    elSubcategory.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join("");
  } else {
    subcatWrap.classList.add("hidden");
  }
}

function render() {
  const queryText = document.getElementById("search").value.toLowerCase();
  const filtered = allTx.filter(t => 
    t.note?.toLowerCase().includes(queryText) || 
    t.subcategory?.toLowerCase().includes(queryText)
  );

  let inc = 0, exp = 0;
  elList.innerHTML = "";
  
  filtered.forEach(t => {
    t.type === "income" ? inc += t.amount : exp += t.amount;
    const cat = settings.categoriesByType[t.type].find(c => c.id === t.categoryId) || {name: "???"};
    
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="meta">
        <div class="line1">
          <span class="amt ${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "+" : "−"} ${fmtKZT(t.amount)}</span>
          <span class="tag">${t.date} • ${t.accountId === 'cash' ? 'Нал' : 'Kaspi'}</span>
        </div>
        <div class="tag"><span class="dot" style="background:${cat.color}"></span> ${cat.name} ${t.subcategory ? '• '+t.subcategory : ''}</div>
      </div>
      <button class="iconbtn danger btn-del" data-id="${t.id}">✕</button>`;
    elList.appendChild(div);
  });

  document.getElementById("totalIncome").textContent = fmtKZT(inc);
  document.getElementById("totalExpense").textContent = fmtKZT(exp);
  document.getElementById("balance").textContent = fmtKZT(inc - exp);
}

// --- EVENTS ---
document.getElementById("txForm").onsubmit = async (e) => {
  e.preventDefault();
  const amount = Number(document.getElementById("amount").value);
  if (!amount) return;

  await addTransaction({
    type: elType.value,
    amount: amount,
    accountId: elAccount.value,
    categoryId: elCategory.value,
    subcategory: subcatWrap.classList.contains("hidden") ? "" : elSubcategory.value,
    note: document.getElementById("note").value,
    date: document.getElementById("date").value,
    createdAt: Date.now()
  });
  
  e.target.reset();
  document.getElementById("date").value = todayISO();
  renderSelects();
};

elList.onclick = (e) => {
  if (e.target.classList.contains('btn-del')) {
    if (confirm("Удалить?")) deleteTransaction(e.target.dataset.id);
  }
};

elType.onchange = renderSelects;
elCategory.onchange = updateSubcatUI;
document.getElementById("search").oninput = render;
document.getElementById("quickAmounts").onclick = (e) => {
  if (e.target.dataset.add) {
    const el = document.getElementById("amount");
    el.value = (Number(el.value) || 0) + Number(e.target.dataset.add);
  }
};

// PIN & Modal
document.getElementById("btnSettings").onclick = () => document.getElementById("modal").classList.remove("hidden");
document.getElementById("btnCloseModal").onclick = () => document.getElementById("modal").classList.add("hidden");

// Init
document.getElementById("date").value = todayISO();
renderSelects();
listenToUpdates();
  
