const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] },
        { id: "food", name: "Еда", sub: [] },
        { id: "home", name: "Дом/Быт", sub: [] }
    ]
};

let allTransactions = [];

// Проверка загрузки Firebase
const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { 
        clearInterval(checkFB); 
        initApp(); 
    }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");

    const elT = document.getElementById("type"), elC = document.getElementById("category"), 
          elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");

    // Обновление категорий
    const updateSelects = () => {
        const cats = DEFAULTS[elT.value] || [];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const cur = cats.find(c => c.id === elC.value);
        if (cur?.sub?.length) { 
            sw.classList.remove("hidden"); 
            elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join(""); 
        } else {
            sw.classList.add("hidden");
            elS.innerHTML = "";
        }
    };
    elT.onchange = updateSelects; elC.onchange = updateSelects;
    updateSelects();

    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    // Загрузка данных в реальном времени
    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    });

    // Фильтры по датам
    document.getElementById("fromDate").onchange = render;
    document.getElementById("toDate").onchange = render;

    // Сохранение записи
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amount = Number(document.getElementById("amount").value);
        if (!amount) return;
        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value,
                amount: amount,
                categoryId: elC.value,
                subcategory: elS.value || "",
                date: document.getElementById("date").value,
                accountId: document.getElementById("account").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (e) { alert("Ошибка сохранения. Проверьте Rules в Firebase."); }
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    
    // Фильтрация
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    // Итоги
    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // Рендер истории
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br><small class="muted">${t.date} • ${t.subcategory || t.categoryId}</small></div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    // --- СТАТИСТИКА (СУММА + КОЛИЧЕСТВО ШТ) ---
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || "Прочее";
        if (!earns[k]) earns[k] = { sum: 0, count: 0 };
        earns[k].sum += t.amount;
        earns[k].count += 1;
    });
    
    document.getElementById("earningsDetails").innerHTML = Object.keys(earns)
        .sort((a,b) => earns[b].sum - earns[a].sum)
        .map(k => `
            <div class="stat-row">
                <span>${k} <small style="color:#888; font-size:11px;">(${earns[k].count} шт.)</small></span>
                <b>${earns[k].sum.toLocaleString()} ₸</b>
            </div>`).join("");
}

// Глобальные функции для кнопок
window.setAmount = (val) => { document.getElementById("amount").value = val; };
window.deleteTx = async (id) => {
    if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id));
};

// Быстрые фильтры дат
document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range; if (!r) return;
    const now = new Date().toISOString().split('T')[0];
    if (r === 'today') { document.getElementById("fromDate").value = now; document.getElementById("toDate").value = now; }
    else if (r === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        document.getElementById("fromDate").value = d.toISOString().split('T')[0];
        document.getElementById("toDate").value = now;
    } else { document.getElementById("fromDate").value = ""; document.getElementById("toDate").value = ""; }
    render();
};

document.getElementById("toggleHistory").onclick = () => {
    const c = document.getElementById("histContent");
    c.classList.toggle("hidden");
    document.getElementById("histArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};
