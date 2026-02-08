const DEFAULTS = {
    income: [
        { id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] },
        { id: "other_inc", name: "Прочий доход", sub: [] }
    ],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка", "Запчасти"] },
        { id: "house", name: "Быт", sub: [] },
        { id: "food", name: "Еда", sub: [] },
        { id: "other_exp", name: "Прочее", sub: [] }
    ]
};

let allTransactions = [];

// Ждем загрузки Firebase
const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) {
        clearInterval(checkFB);
        initApp();
    }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    
    const elT = document.getElementById("type");
    const elC = document.getElementById("category");
    const elS = document.getElementById("subcategory");
    const sw = document.getElementById("subcatWrap");

    // Заполнение категорий
    const fillCats = () => {
        const type = elT.value;
        elC.innerHTML = DEFAULTS[type].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        fillSubs();
    };

    const fillSubs = () => {
        const type = elT.value;
        const cat = DEFAULTS[type].find(i => i.id === elC.value);
        if (cat && cat.sub.length > 0) {
            sw.classList.remove("hidden");
            elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join("");
        } else {
            sw.classList.add("hidden");
            elS.innerHTML = "";
        }
    };

    elT.addEventListener('change', fillCats);
    elC.addEventListener('change', fillSubs);
    fillCats();

    // Слушатель данных из Firebase
    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    fbMethods.onSnapshot(q, (snap) => {
        allTransactions = [];
        snap.forEach(d => allTransactions.push({ id: d.id, ...d.data() }));
        render();
    });

    // Слушатели фильтров
    document.getElementById("fromDate").addEventListener('input', render);
    document.getElementById("toDate").addEventListener('input', render);

    // Сохранение записи
    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if (!amt) return;

        const catObj = DEFAULTS[elT.value].find(i => i.id === elC.value);
        
        try {
            await fbMethods.addDoc(colRef, {
                type: elT.value,
                amount: amt,
                categoryName: catObj ? catObj.name : "Прочее",
                subcategory: elS.value || "",
                date: document.getElementById("date").value,
                createdAt: Date.now()
            });
            document.getElementById("amount").value = "";
        } catch (err) {
            console.error("Ошибка сохранения:", err);
            alert("Ошибка при сохранении!");
        }
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;

    // Фильтрация
    const filtered = allTransactions.filter(t => {
        const d = t.date;
        return (!from || d >= from) && (!to || d <= to);
    });

    // 1. РЕАЛЬНЫЕ ИТОГИ
    const realTotalInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realTotalExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realTotalInc - realTotalExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realTotalInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realTotalExp.toLocaleString() + " ₸";

    // 2. МАТЕМАТИКА ВД (ТВОЯ ФОРМУЛА)
    let totalPotDots = 0;   // Точки по новому тарифу
    let totalRealDots = 0;  // Те же точки по старому тарифу
    const potBreakdown = {};

    filtered.forEach(t => {
        if (t.type !== 'income') return;
        const sub = t.subcategory || "";
        const amt = t.amount;

        // Исключаем ЗП (4000+) и Карго
        if (amt >= 4000 || sub === "Карго") return;

        // Только точки доставки
        if (["F1", "F2", "F3", "Ночь"].includes(sub)) {
            let pAmt = amt;
            if (amt === 150) pAmt = 600;
            else if (amt === 300) pAmt = 900;
            else if (sub === "Ночь" && amt === 500) pAmt = 1000;
            
            // Группировка для красоты
            if (!potBreakdown[sub]) potBreakdown[sub] = { count: 0, sum: 0 };
            potBreakdown[sub].count++;
            potBreakdown[sub].sum += pAmt;

            totalPotDots += pAmt;
            totalRealDots += amt;
        }
    });

    const pureGain = totalPotDots - totalRealDots;
    const finalVdTotal = realTotalInc + pureGain;

    // Отрисовка ВД
    document.getElementById("potentialStats").innerHTML = `
        <div style="border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 10px;">
            ${Object.entries(potBreakdown).map(([n, d]) => `
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:4px;">
                    <span>${n} (x${d.count})</span>
                    <b>${d.sum.toLocaleString()} ₸</b>
                </div>
            `).join("") || "<small class='muted'>Нет данных для пересчета</small>"}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:15px; color: var(--accent); font-weight: bold;">
            <span>Итого (ВД + Зарплаты):</span>
            <b>${finalVdTotal.toLocaleString()} ₸</b>
        </div>
        <div class="gain-box">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <small>Чистая выгода:</small>
                <b class="pos" style="font-size:18px;">+${pureGain.toLocaleString()} ₸</b>
            </div>
        </div>
    `;

    // 3. РЕАЛЬНЫЙ ДОХОД ПО ТОЧКАМ
    const earns = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!earns[k]) earns[k] = { sum: 0, count: 0, b: {} };
        earns[k].sum += t.amount; 
        earns[k].count++;
        earns[k].b[t.amount] = (earns[k].b[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(earns).map(([k, d]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${Object.entries(d.b).map(([p, c]) => `${p}×${c}`).join(" | ")}</div>
        </div>`).join("");

    // 4. РАСХОДЫ
    const exps = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        const k = t.categoryName || "Прочее";
        if (!exps[k]) exps[k] = 0;
        exps[k] += t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exps).map(([k, v]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k}</span><b class="neg">${v.toLocaleString()} ₸</b></div>
        </div>`).join("") || "<small class='muted'>Нет расходов</small>";

    // 5. ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} • ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none; border:none; color:#555; padding:5px;">✕</button>
        </div>`).join("");
}

window.deleteTx = async (id) => {
    if(confirm("Удалить?")) {
        const { fbDB, fbMethods } = window;
        await fbMethods.deleteDoc(fbMethods.doc(fbDB, "transactions", id));
    }
};
