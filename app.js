// 1. ОБНОВЛЕННЫЕ КАТЕГОРИИ
const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] },
        { id: "food", name: "Еда", sub: [] },
        { id: "drinks", name: "Напитки", sub: [] },
        { id: "home", name: "Дом/Быт", sub: [] },
        { id: "clothes", name: "Одежда", sub: [] },
        { id: "other_exp", name: "Прочее", sub: [] }
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

    const elT = document.getElementById("type"), 
          elC = document.getElementById("category"), 
          elS = document.getElementById("subcategory"), 
          sw = document.getElementById("subcatWrap");

    // Функция обновления списков (Категории и Подкатегории)
    const updateSelects = () => {
        const type = elT.value; // income или expense
        const cats = DEFAULTS[type] || [];
        
        // Заполняем основные категории
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        
        // Проверяем наличие подкатегорий у выбранной категории
        const currentCat = cats.find(c => c.id === elC.value);
        
        if (currentCat && currentCat.sub && currentCat.sub.length > 0) { 
            sw.classList.remove("hidden"); 
            elS.innerHTML = currentCat.sub.map(s => `<option value="${s}">${s}</option>`).join(""); 
        } else {
            sw.classList.add("hidden");
            elS.innerHTML = ""; // Очищаем, если подкатегорий нет
        }
    };

    // Вешаем события на переключение
    elT.onchange = updateSelects; 
    elC.onchange = updateSelects;
    
    // Вызываем первый раз при загрузке
    updateSelects();

    // Устанавливаем текущую дату
    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    // Загрузка данных из Firebase
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

        // Определяем понятное имя категории для истории
        const catObj = DEFAULTS[elT.value].find(c => c.id === elC.value);
        const catName = catObj ? catObj.name : elC.value;

        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value,
                amount: amount,
                categoryId: elC.value,
                categoryName: catName, // Сохраняем имя для удобства
                subcategory: elS.value || "",
                date: document.getElementById("date").value,
                accountId: document.getElementById("account").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
            alert("Запись добавлена!");
        } catch (e) { 
            console.error(e);
            alert("Ошибка сохранения. Проверьте Rules в консоли Firebase."); 
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

    // Рендер списка истории
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div>
                <b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
                <small class="muted">${t.date} • ${t.subcategory || t.categoryName || t.categoryId}</small>
            </div>
            <button class="del-btn" onclick="deleteTx('${t.id}')">✕</button>
        </div>`).join("");

    // СТАТИСТИКА ПО ДОХОДАМ (ДОСТАВКА)
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || "Прочий доход";
        if (!earns[k]) earns[k] = { sum: 0, count: 0, breakdown: {} };
        earns[k].sum += t.amount;
        earns[k].count += 1;
        earns[k].breakdown[t.amount] = (earns[k].breakdown[t.amount] || 0) + 1;
    });
    
    document.getElementById("earningsDetails").innerHTML = Object.keys(earns)
        .sort((a,b) => earns[b].sum - earns[a].sum)
        .map(k => {
            const details = Object.entries(earns[k].breakdown)
                .sort((a, b) => b[0] - a[0])
                .map(([price, count]) => `${price} × ${count}шт`)
                .join(" | ");
            return `
            <div class="stat-row" style="flex-direction: column; align-items: flex-start; gap: 4px; border-bottom: 1px solid #222; padding: 10px 0;">
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>${k} <small style="color:#888;">(${earns[k].count} шт.)</small></span>
                    <b>${earns[k].sum.toLocaleString()} ₸</b>
                </div>
                <div style="font-size: 11px; color: #ffd166; opacity: 0.8;">${details}</div>
            </div>`;
        }).join("");
}

window.setAmount = (val) => { document.getElementById("amount").value = val; };

window.deleteTx = async (id) => {
    if(confirm("Удалить эту запись?")) {
        await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id));
    }
};

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
