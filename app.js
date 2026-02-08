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

    // Баланс и Бензин
    document.getElementById("balance").textContent = (realInc - realExp).toLocaleString() + " ₸";
    document.getElementById("totalIncome").textContent = realInc.toLocaleString() + " ₸";
    document.getElementById("totalExpense").textContent = realExp.toLocaleString() + " ₸";
    
    const gasPerc = realInc > 0 ? ((gasExp / realInc) * 100).toFixed(1) : 0;
    document.getElementById("gasText").textContent = `Бензин: ${gasPerc}% (${gasExp.toLocaleString()} ₸)`;
    document.getElementById("gasFill").style.width = Math.min(gasPerc * 2, 100) + "%";

    // РЕАЛ
    const realBySub = {};
    filtered.filter(t => t.type === 'income').forEach(t => {
        const k = t.subcategory || t.categoryName;
        if (!realBySub[k]) realBySub[k] = { sum: 0, count: 0, breakdown: {} };
        realBySub[k].sum += t.amount; realBySub[k].count++;
        realBySub[k].breakdown[t.amount] = (realBySub[k].breakdown[t.amount] || 0) + 1;
    });
    document.getElementById("earningsDetails").innerHTML = Object.entries(realBySub).map(([k, d]) => `
        <div class="stat-row"><div class="stat-main"><span>${k} (${d.count})</span><b>${d.sum.toLocaleString()} ₸</b></div>
        <div class="stat-sub">${Object.entries(d.breakdown).map(([p, c]) => `${p}₸×${c}`).join(" | ")}</div></div>`).join("");

    // ВД
    let totalVd = 0; const vdStats = {}; const pts = ["F1", "F2", "F3", "Ночь"];
    filtered.forEach(t => {
        if (t.type === 'income' && pts.includes(t.subcategory)) {
            let pot = (t.amount === 150 ? 600 : (t.amount === 300 ? 900 : (t.subcategory === "Ночь" && t.amount === 500 ? 1000 : t.amount)));
            totalVd += pot; vdStats[t.subcategory] = (vdStats[t.subcategory] || 0) + pot;
        }
    });
    let gain = 0;
    document.getElementById("potentialStats").innerHTML = pts.map(p => {
        const v = vdStats[p] || 0, r = realBySub[p]?.sum || 0, d = v - r; gain += d;
        return v>0 || r>0 ? `<div class="stat-main" style="margin-bottom:8px;"><span>${p} (ВД: ${v.toLocaleString()} ₸)</span><span class="pos">+${d.toLocaleString()} ₸</span></div>` : "";
    }).join("") + `<div class="gain-box"><span>ВЫГОДА:</span><span class="pos">+${gain.toLocaleString()} ₸</span></div>`;

    // РАСХОДЫ
    const exG = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
        exG[t.categoryName] = (exG[t.categoryName] || 0) + t.amount;
    });
    document.getElementById("expenseDetails").innerHTML = Object.entries(exG).map(([n, v]) => `<div class="stat-main"><span>${n}</span><b class="neg">${v.toLocaleString()} ₸</b></div>`).join("");

    // ИСТОРИЯ
    document.getElementById("list").innerHTML = filtered.map(t => `<div class="item"><div><b class="${t.type==='income'?'pos':'neg'}">${t.amount.toLocaleString()} ₸</b><br><small class="muted">${t.date} | ${t.subcategory || t.categoryName}</small></div><button onclick="deleteTx('${t.id}')" style="background:none;border:none;color:#444;">✕</button></div>`).join("");
}

window.render = render;
window.deleteTx = async (id) => { if(confirm("Удалить?")) await window.fbMethods.deleteDoc(window.fbMethods.doc(window.fbDB, "transactions", id)); };
