const DEFAULTS = {
    income: [{ id: "delivery", name: "Доставка", sub: ["F1", "F2", "F3", "Карго", "Ночь"] }],
    expense: [
        { id: "auto", name: "Авто", sub: ["Бензин", "Ремонт", "Запчасти", "Мойка"] },
        { id: "food", name: "Еда", sub: [] }
    ]
};

let allTransactions = [];

const checkFB = setInterval(() => {
    if (window.fbDB) {
        clearInterval(checkFB);
        initApp();
    }
}, 300);

// Функция для кнопок быстрой суммы
window.setAmount = (val) => {
    const el = document.getElementById("amount");
    el.value = val;
    el.classList.add("pulse"); // Визуальный эффект нажатия
    setTimeout(() => el.classList.remove("pulse"), 200);
};

function initApp() {
    const { fbDB, fbMethods } = window;
    const colRef = fbMethods.collection(fbDB, "transactions");

    document.getElementById("date").value = new Date().toISOString().split('T')[0];

    const elT = document.getElementById("type"), elC = document.getElementById("category"), elS = document.getElementById("subcategory"), sw = document.getElementById("subcatWrap");
    
    const updateSelects = () => {
        const cats = DEFAULTS[elT.value];
        elC.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        const cur = cats.find(c => c.id === elC.value);
        if (cur && cur.sub && cur.sub.length) { 
            sw.classList.remove("hidden"); 
            elS.innerHTML = cur.sub.map(s => `<option value="${s}">${s}</option>`).join(""); 
        } else { sw.classList.add("hidden"); }
    };
    elT.onchange = updateSelects; elC.onchange = updateSelects;
    updateSelects();

    const q = fbMethods.query(colRef, fbMethods.orderBy("date", "desc"));
    fbMethods.onSnapshot(q, (snapshot) => {
        allTransactions = [];
        snapshot.forEach(doc => allTransactions.push({ id: doc.id, ...doc.data() }));
        render();
    });

    document.getElementById("txForm").onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById("saveBtn");
        btn.disabled = true;
        const tx = {
            type: elT.value,
            amount: Number(document.getElementById("amount").value),
            categoryId: elC.value,
            subcategory: elS.value || "",
            date: document.getElementById("date").value,
            accountId: document.getElementById("account").value,
            createdAt: Date.now()
        };
        await fbMethods.addDoc(colRef, tx);
        document.getElementById("amount").value = "";
        btn.disabled = false;
    };

    window.deleteTx = async (id) => {
        if (confirm("Удалить?")) await fbMethods.deleteDoc(fbMethods.doc(fbDB, "transactions", id));
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
            <div class="meta">
                <b class="${t.type === 'income' ? 'pos' : 'neg'}">${t.amount.toLocaleString()} ₸</b>
                <div class="small muted">${t.date} • ${t.subcategory || t.categoryId}</div>
            </div>
            <button class="iconbtn" onclick="deleteTx('${t.id}')">✕</button>
        </div>
    `).join("");

    updateStats(filtered);
}

function updateStats(list) {
    const incList = list.filter(t => t.type === 'income');
    const earns = {}, counts = {};

    incList.forEach(t => {
        const p = t.subcategory || "Общее";
        earns[p] = (earns[p] || 0) + t.amount;
        if (!counts[p]) counts[p] = {};
        counts[p][t.amount] = (counts[p][t.amount] || 0) + 1;
    });

    document.getElementById("earningsDetails").innerHTML = Object.keys(earns).sort((a,b)=>earns[b]-earns[a]).map(k => `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2c2c2e;">
            <span style="color:#65d48b">${k}</span><b>${earns[k].toLocaleString()} ₸</b>
        </div>
    `).join("");

    let h = "";
    for (const p in counts) {
        h += `<div style="margin-top:10px;"><b>${p}:</b>` + Object.keys(counts[p]).sort((a,b)=>b-a).map(pr => `
            <div style="display:flex; justify-content:space-between; padding-left:10px; font-size:13px; color:#aaa;">
                <span>${pr} ₸</span><span>${counts[p][pr]} шт.</span>
            </div>`).join("") + `</div>`;
    }
    document.getElementById("countDetails").innerHTML = h || "Нет данных";
}

document.querySelector(".quick2").onclick = (e) => {
    const r = e.target.dataset.range;
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
