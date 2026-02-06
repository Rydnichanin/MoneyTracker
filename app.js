const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [{ id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] }, { id: "food", name: "Еда", sub: [] }]
};

let allTransactions = [];
let unsubscribe = null;

// Запуск приложения сразу после загрузки Firebase
const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { 
        clearInterval(checkFB); 
        initApp(); 
    }
}, 300);

window.setAmount = (val) => { document.getElementById("amount").value = val; };

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    
    // Текущая дата по умолчанию
    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    // Настройка категорий
    const elT = document.getElementById("type"), elC = document.getElementById("category"), elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");
    
    const updateSelects = () => {
        const cats = DEFAULTS[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const cur = cats.find(c => c.id === elC.value);
        if (cur?.sub?.length) { 
            sw.classList.remove("hidden"); 
            elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join(""); 
        } else sw.classList.add("hidden");
    };
    elT.onchange = updateSelects; elC.onchange = updateSelects;
    updateSelects();

    // Загрузка данных (в реальном времени)
    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    });

    document.getElementById("fromDate").onchange = render;
    document.getElementById("toDate").onchange = render;

    // Сохранение
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value,
                amount: Number(document.getElementById("amount").value),
                categoryId: elC.value,
                subcategory: elS.value || "",
                date: document.getElementById("date").value,
                accountId: document.getElementById("account").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (e) {
            alert("Ошибка! Проверьте Правила Firestore в консоли Firebase.");
        }
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br><small class="muted">${t.date} • ${t.subcategory || t.categoryId}</small></div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || "Прочее";
        earns[k] = (earns[k] || 0) + t.amount;
    });
    document.getElementById("earningsDetails").innerHTML = Object.keys(earns).sort((a,b)=>earns[b]-earns[a]).map(k => `
        <div class="stat-row"><span>${k}</span><b>${earns[k].toLocaleString()} ₸</b></div>`).join("");
}

window.deleteTx = async (id) => {
    if(confirm("Удалить запись?")) {
        await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id));
    }
};

// Быстрые фильтры
document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range; if (!r) return;
    const now = new Date().toISOString().split('T')[0];
    if (r === 'today') {
        document.getElementById("fromDate").value = now;
        document.getElementById("toDate").value = now;
    } else if (r === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        document.getElementById("fromDate").value = d.toISOString().split('T')[0];
        document.getElementById("toDate").value = now;
    } else {
        document.getElementById("fromDate").value = "";
        document.getElementById("toDate").value = "";
    }
    render();
};

document.getElementById("toggleHistory").onclick = () => {
    const c = document.getElementById("histContent");
    c.classList.toggle("hidden");
    document.getElementById("histArrow").textContent = c.classList.contains("hidden") ? "▼" : "▲";
};
