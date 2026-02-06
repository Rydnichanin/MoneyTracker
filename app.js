// 1. Настройки категорий (теперь они всегда под рукой)
const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] },
        { id: "food", name: "Еда", sub: [] },
        { id: "other", name: "Прочее", sub: [] }
    ]
};

let allTransactions = [];

// 2. Функция обновления выпадающих списков (Категории)
function updateSelects() {
    const elT = document.getElementById("type");
    const elC = document.getElementById("category");
    const elS = document.getElementById("subcategory");
    const sw = document.getElementById("subcatWrap");

    if (!elT || !elC) return;

    const cats = DEFAULTS[elT.value] || [];
    elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

    const cur = cats.find(c => c.id === elC.value);
    if (cur && cur.sub && cur.sub.length > 0) {
        sw.classList.remove("hidden");
        elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join("");
    } else {
        sw.classList.add("hidden");
        elS.innerHTML = "";
    }
}

// 3. Запуск приложения
const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) {
        clearInterval(checkFB);
        initApp();
    }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");

    // Инициализируем селекторы
    const elT = document.getElementById("type");
    const elC = document.getElementById("category");
    
    elT.onchange = updateSelects;
    elC.onchange = updateSelects;
    updateSelects(); // Заполняем категории сразу

    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    // Слушаем базу данных (История)
    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    }, (error) => {
        console.error("Ошибка Firestore:", error);
        alert("Ошибка доступа к данным. Проверьте Rules в Firebase!");
    });

    // Сохранение новой записи
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amount = Number(document.getElementById("amount").value);
        if (!amount) return;

        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value,
                amount: amount,
                categoryId: elC.value,
                subcategory: document.getElementById("subcategory").value || "",
                date: document.getElementById("date").value,
                accountId: document.getElementById("account").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (err) {
            alert("Не удалось сохранить: " + err.message);
        }
    };
}

// 4. Отрисовка баланса и истории
function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    
    const filtered = allTransactions.filter(t => {
        const d = t.date;
        return (!from || d >= from) && (!to || d <= to);
    });

    const inc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (inc - exp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = inc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = exp.toLocaleString() + " ₸";

    // Список истории
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div>
                <b class="${t.type === 'income' ? 'pos' : 'neg'}">${t.amount.toLocaleString()} ₸</b><br>
                <small class="muted">${t.date} • ${t.subcategory || t.categoryId}</small>
            </div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    // Доход по точкам
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || "Прочее";
        earns[k] = (earns[k] || 0) + t.amount;
    });
    
    document.getElementById("earningsDetails").innerHTML = Object.keys(earns)
        .sort((a, b) => earns[b] - earns[a])
        .map(k => `<div class="stat-row"><span>${k}</span><b>${earns[k].toLocaleString()} ₸</b></div>`)
        .join("");
}

// Глобальные функции
window.setAmount = (val) => { document.getElementById("amount").value = val; };

window.deleteTx = async (id) => {
    if (confirm("Удалить запись?")) {
        await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id));
    }
};

// Фильтры дат
document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range;
    if (!r) return;
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
