const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Мойка"] },
        { id: "food", name: "Еда", sub: [] },
        { id: "other", name: "Прочее", sub: [] }
    ]
};

let allTransactions = [];

const checkFB = setInterval(() => {
    if (window.fbDB && window.fbMethods) { clearInterval(checkFB); initApp(); }
}, 100);

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");
    const elT = document.getElementById("type"), elC = document.getElementById("category"), 
          elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap"),
          elDate = document.getElementById("date");

    elDate.value = new Date().toISOString().split('T')[0];

    const fillCats = () => {
        elC.innerHTML = DEFAULTS[elT.value].map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        fillSubs();
    };
    const fillSubs = () => {
        const cat = DEFAULTS[elT.value].find(i => i.id === elC.value);
        if (cat && cat.sub.length > 0) { sw.classList.remove("hidden"); elS.innerHTML = cat.sub.map(s => `<option value="${s}">${s}</option>`).join(""); }
        else { sw.classList.add("hidden"); elS.innerHTML = ""; }
    };

    elT.onchange = fillCats; elC.onchange = fillSubs; fillCats();

    document.getElementById("fromDate").oninput = render;
    document.getElementById("toDate").oninput = render;

    fbMethods.onSnapshot(fbMethods.query(colRef, fbMethods.orderBy("date", "desc")), (snap) => {
        allTransactions = [];
        snap.forEach(d => allTransactions.push({ id: d.id, ...d.data() }));
        render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(document.getElementById("amount").value);
        if(!amt) return;
        const catObj = DEFAULTS[elT.value].find(i => i.id === elC.value);
        await fbMethods.addDoc(colRef, {
            type: elT.value, amount: amt, categoryName: catObj.name,
            subcategory: elS.value || "", date: elDate.value, createdAt: Date.now()
        });
        document.getElementById("amount").value = "";
    };
}

function render() {
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const filtered = allTransactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

    const realInc = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const realExp = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const gasExp = filtered.filter(t => t.subcategory === 'Бензин').reduce((s, t) => s + t.amount, 0);

    document.getElementById("balance").textContent = (realInc - realExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realExp.toLocaleString() + " ₸";
    
    const gasPerc = realInc > 0 ? ((gasExp / realInc) * 100).toFixed(1) : 0;
    document.getElementById("gasText").textContent = `Бензин к доходу: ${gasPerc}% (${gasExp.toLocaleString()} ₸)`;
    document.getElementById("gasFill").style.width = Math.min(gasPerc * 3, 100) + "%";

    // --- РЕАЛ (Считает всё) ---
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!realBySub[k]) realBySub[k] = { sum: 0, count: 0, breakdown: {} };
        realBySub[k].sum += t.amount; 
        realBySub[k].count++;
        realBySub[k].breakdown[t.amount] = (realBySub[k].breakdown[t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row">
            <div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
            <div class="stat-sub">${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div>
        </div>`).join("");

    // --- ВД (СТРОГИЙ ФИЛЬТР: ИГНОРИРУЕТ >= 4000) ---
    let totalGain = 0;
    const vdStats = {};
    const deliverySubs = ["F1", "F2", "F3", "Ночь", "Карго"];

    filtered.forEach(t => {
        // Проверка: доход, нужная категория и сумма СТРОГО меньше 4000
        if (t.type === 'income' && deliverySubs.includes(t.subcategory) && t.amount < 4000) {
            if(!vdStats[t.subcategory]) vdStats[t.subcategory] = { vdSum: 0, realSum: 0 };
            
            let pot = t.amount;
            if (t.amount === 150) pot = 600;
            else if (t.amount === 300) pot = 900;
            else if (t.subcategory === "Ночь" && t.amount === 500) pot = 1000;
            
            vdStats[t.subcategory].vdSum += pot;
            vdStats[t.subcategory].realSum += t.amount;
        }
    });

    const vdHtml = Object.entries(vdStats).map(([p, data]) => {
        const diff = data.vdSum - data.realSum;
        totalGain += diff;
        return `
            <div class="stat-row">
                <div class="stat-main"><span>${p}</span><b>${data.vdSum.toLocaleString()} ₸</b></div>
                <div class="diff-label pos">Выгода: +${diff.toLocaleString()} ₸</div>
            </div>`;
    }).join("");

    document.getElementById("potentialStats").innerHTML = vdHtml || '<div class="muted" style="text-align:center">Нет данных для расчёта ВД (крупные суммы не считаются)</div>';
    if (totalGain > 0) {
        document.getElementById("potentialStats").innerHTML += `<div class="gain-box"><span>ОБЩАЯ ВЫГОДА ВД:</span><span class="pos">+${totalGain.toLocaleString()} ₸</span></div>`;
    }

    // РАСХОДЫ
    const exG = {};
    filtered.filter(t => t.type === 'expense').forEach(t => { exG[t.categoryName] = (exG[t.categoryName] || 0) + t.amount; });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exG).map(([n, v]) => `<div class="stat-main" style="padding: 5px 0;"><span>${n}</span><b class="neg">${v.toLocaleString()} ₸</b></div>`).join("");

    // ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `
        <div class="item">
            <div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br>
            <small class="muted">${t.date} | ${t.subcategory || t.categoryName}</small></div>
            <button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;padding:10px;">✕</button>
        </div>`).join("");
}

window.render = render;
window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
