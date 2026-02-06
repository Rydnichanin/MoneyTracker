const SETTINGS_KEY = "money_tracker_settings_main";
const DEFAULTS = {
    categoriesByType: {
        income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }, { id: "taxi", name: "Такси", sub: [] }],
        expense: [{ id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка"] }, { id: "food", name: "Еда", sub: [] }]
    }
};

let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || DEFAULTS;
let allTransactions = [];

// Ждем инициализации Firebase
const waitFB = setInterval(() => {
    if (window.fbDB) {
        clearInterval(waitFB);
        startApp();
    }
}, 100);

function startApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");

    // Первоначальная настройка формы
    initFormLogic();

    // Слушатель данных из Firebase
    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        renderAll();
    });

    // Сохранение
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const tx = {
            type: document.getElementById("type").value,
            amount: Number(document.getElementById("amount").value),
            categoryId: document.getElementById("category").value,
            subcategory: document.getElementById("subcategory").value,
            date: document.getElementById("date").value,
            accountId: document.getElementById("account").value,
            serverTime: Date.now()
        };
        await fbMethods.addDoc(colRef, tx);
        document.getElementById("amount").value = "";
    };

    window.deleteTx = async (id) => {
        if (confirm("Удалить запись из облака?")) {
            await fbMethods.deleteDoc(fbMethods.doc(fbDB, "transactions", id));
        }
    };
}

function renderAll() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    
    const filtered = allTransactions.filter(t => {
        if (from && t.date < from) return false;
        if (to && t.date > to) return false;
        return true;
    });

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // Рендер списка
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div class="meta">
                <b class="${t.type === 'income' ? 'pos' : 'neg'}">${t.amount.toLocaleString()} ₸</b>
                <div class="small muted">${t.date} • ${t.subcategory || t.categoryId}</div>
            </div>
            <button class="iconbtn" onclick="deleteTx('${t.id}')">✕</button>
        </div>
    `).join("");

    updateStats(filtered);
}

let cIE, cCat;
function updateStats(list) {
    const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    if (cIE) cIE.destroy();
    cIE = new Chart(document.getElementById("chartIE"), {
        type: 'bar',
        data: { labels: ['Доход', 'Расход'], datasets: [{ data: [inc, exp], backgroundColor: ['#65d48b', '#ff6b6b'] }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Статистика по суммам и штукам
    const incList = list.filter(t => t.type === 'income');
    const earnsMap = {};
    const countMap = {};

    incList.forEach(t => {
        const p = t.subcategory || "Общее";
        earnsMap[p] = (earnsMap[p] || 0) + t.amount;
        if (!countMap[p]) countMap[p] = {};
        countMap[p][t.amount] = (countMap[p][t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.keys(earnsMap).map(k => `
        <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #2a2a2f;">
            <span style="color:#65d48b">${k}</span><b>${earnsMap[k].toLocaleString()} ₸</b>
        </div>
    `).join("");

    let cntH = "";
    for (const p in countMap) {
        cntH += `<div style="margin-top:10px;"><b>${p}:</b>`;
        Object.keys(countMap[p]).sort((a,b)=>b-a).forEach(price => {
            cntH += `<div style="display:flex; justify-content:space-between; font-size:13px; padding-left:10px;">
                <span>${price} ₸</span><span class="muted">${countMap[p][price]} шт.</span>
            </div>`;
        });
        cntH += `</div>`;
    }
    document.getElementById("countDetails").innerHTML = cntH || "Нет данных";
}

function initFormLogic() {
    const elT = document.getElementById("type"), elC = document.getElementById("category"), elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");
    elT.value = "income";
    const up = () => {
        const cats = settings.categoriesByType[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const cur = cats.find(c => c.id === elC.value);
        if (cur && cur.sub.length) { sw.classList.remove("hidden"); elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
        else sw.classList.add("hidden");
    };
    elT.onchange = up; elC.onchange = up;
    document.getElementById("date").value = new Date().toISOString().split('T')[0];
    up();
}

// Фильтры
document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range;
    const today = new Date().toISOString().split('T')[0];
    if (r === 'today') { document.getElementById("fromDate").value = today; document.getElementById("toDate").value = today; }
    else if (r === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        document.getElementById("fromDate").value = d.toISOString().split('T')[0];
        document.getElementById("toDate").value = today;
    } else { document.getElementById("fromDate").value = ""; document.getElementById("toDate").value = ""; }
    renderAll();
};
document.getElementById("fromDate").onchange = renderAll;
document.getElementById("toDate").onchange = renderAll;

// Сворачивание
document.getElementById("toggleHistory").onclick = () => {
    const c = document.getElementById("histContent");
    const isH = c.classList.toggle("hidden");
    document.getElementById("histArrow").textContent = isH ? "▲" : "▼";
};
