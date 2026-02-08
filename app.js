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

// Конфигурация Firebase (замени на свои данные, если они другие)
const firebaseConfig = { /* ТВОИ ДАННЫЕ ИЗ КОНСОЛИ FIREBASE */ };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let allTx = [];
let currentFilter = 'all';

// Инициализация
const elT = document.getElementById("type"), elC = document.getElementById("category"), 
      elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap"),
      elDate = document.getElementById("date");

elDate.value = new Date().toISOString().split('T')[0];

function fillCats() {
    elC.innerHTML = DEFAULTS[elT.value].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
    fillSubs();
}
function fillSubs() {
    const cat = DEFAULTS[elT.value].find(i => i.id === elC.value);
    if (cat && cat.sub.length > 0) { sw.classList.remove("hidden"); elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
    else { sw.classList.add("hidden"); elS.innerHTML = ""; }
}

elT.onchange = fillCats; elC.onchange = fillSubs; fillCats();

// Загрузка данных
db.collection("transactions").orderBy("date", "desc").onSnapshot(snap => {
    allTx = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
});

// Сохранение
document.getElementById("txForm").onsubmit = async (e) => {
    e.preventDefault();
    const amt = Number(document.getElementById("amount").value);
    if (!amt) return;
    const catName = DEFAULTS[elT.value].find(i => i.id === elC.value).name;
    await db.collection("transactions").add({
        type: elT.value, amount: amt, categoryName: catName,
        subcategory: elS.value || "", date: elDate.value, createdAt: Date.now()
    });
    document.getElementById("amount").value = "";
};

function setFilter(f) { currentFilter = f; render(); }
function setAmt(v) { document.getElementById("amount").value = v; }
function toggleSec(id) { const s = document.getElementById(id); s.style.display = s.style.display === 'none' ? 'block' : 'none'; }

function render() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const filtered = allTx.filter(t => {
        if (currentFilter === 'today') return t.date === todayStr;
        if (currentFilter === 'yesterday') {
            const y = new Date(); y.setDate(y.getDate()-1);
            return t.date === y.toISOString().split('T')[0];
        }
        if (
