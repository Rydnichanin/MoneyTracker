/* AI WhatsApp parser v2: Firebase-first, semantic analysis, confidence questions, learning */
(function(){
  let questions=[];
  const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^0-9a-zа-я]+/gi,' ').replace(/\s+/g,' ').trim();
  const tariff=(point,type)=> type==='other'?0:(String(point).toUpperCase().includes('ALLEY')?(type==='flat'?900:600):(type==='flat'?300:150));
  function special(address,text){
    const s=(String(address||'')+' '+String(text||'')).toLowerCase().replace(/ё/g,'е');
    if(/валерьяновк/.test(s)||/октябрьск/.test(s)) return {type:'under',amount:2500};
    if(/дач/.test(s)&&/(кпп|проходн|ворот)/.test(s)) return {type:'other',amount:2000};
    if(/дач/.test(s)&&/(домик|дом)/.test(s)) return {type:'other',amount:2800};
    if(/речк/.test(s)) return {type:'other',amount:1500};
    if(/домик\s+газовик/.test(s)) return {type:'other',amount:1000};
    if(/колизе|гараж|коттедж/.test(s)) return {type:'under',amount:150};
    return null;
  }
  function candidates(addr,db){
    const q=norm(addr), qt=new Set(q.split(' ').filter(Boolean));
    return (db||[]).map(a=>{const k=norm(a.addr),at=new Set(k.split(' ').filter(Boolean));let score=k===q?100:(k.includes(q)||q.includes(k)?90:0);if(!score){let c=0;qt.forEach(x=>{if(at.has(x))c++});score=Math.round(c/Math.max(qt.size,at.size,1)*80)}return {a,score}}).filter(x=>x.score>=55).sort((a,b)=>b.score-a.score).slice(0,5);
  }
  const esc=s=>window.esc?window.esc(s):String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function renderQuestions(){
    if(!questions.length)return '';
    return `<div style="margin-top:12px;padding:12px;border:1px solid #4a9eff;border-radius:12px;background:#0a1020"><div style="font-size:11px;color:#4a9eff;margin-bottom:8px">❓ Нужна подсказка</div>${questions.map((q,i)=>`<div style="padding:10px 0;border-bottom:1px solid #1a2a4a"><b>${esc(q.address)}</b><div style="font-size:12px;color:#aaa;margin:4px 0 8px">${esc(q.reason)}</div><div style="display:flex;gap:6px"><button onclick="answerWAQuestion(${i},'under')" style="flex:1;padding:9px;border-radius:8px;border:1px solid #4a9eff;background:#0a1020;color:#4a9eff">🏠 До подъезда</button><button onclick="answerWAQuestion(${i},'flat')" style="flex:1;padding:9px;border-radius:8px;border:1px solid #65d48b;background:#0a1a0a;color:#65d48b">🏢 До квартиры</button></div></div>`).join('')}</div>`;
  }
  window.answerWAQuestion=async(i,type)=>{const q=questions[i];if(!q)return;waEntries.push({point:q.point,amount:tariff(q.point,type),address:q.address,type:type==='flat'?'до квартиры':'до подъезда',msgTime:q.msgTime||''});questions.splice(i,1);renderWAResult();try{const db=await loadCustomAddressesAsync();if(!db.some(a=>norm(a.addr)===norm(q.address))){db.push({addr:q.address,type,price:tariff(q.point,type),learned:true,learnedAt:Date.now()});await saveCustomAddresses(db)}}catch(e){}};
  window.parseWA=async()=>{
    const text=document.getElementById('waInput').value.trim();if(!text)return showToast('Вставь текст из WhatsApp','error');
    const btn=document.querySelector('#tab-wa .card button');btn.textContent='⏳ Firebase → ИИ...';btn.disabled=true;questions=[];waEntries=[];
    try{
      if(nightMode){waEntries=text.split('\n').filter(x=>/\d+-\d+/.test(x)).map(x=>({point:'Ночь',amount:500,address:x.trim(),type:'до подъезда',msgTime:''}));renderWAResult();return}
      const db=await loadCustomAddressesAsync();
      const p=localStorage.getItem('aiProvider')||'groq';let key,base,model,gem=false;
      if(p==='groq'){key=await _SEC.getApiKey('groqKey');base='https://api.groq.com/openai/v1';model=localStorage.getItem('groqModel')||'llama-3.1-8b-instant'}
      else if(p==='openai'){key=await _SEC.getApiKey('openaiKey');base='https://api.openai.com/v1';model=localStorage.getItem('openaiModel')||'gpt-4o-mini'}
      else if(p==='custom'){key=await _SEC.getApiKey('customKey');base=(localStorage.getItem('customUrl')||'https://api.groq.com/openai/v1').replace(/\/+$/,'');model=localStorage.getItem('customModel')||'llama-3.1-8b-instant'}
      else if(p==='gemini'){key=await _SEC.getApiKey('geminiKey');model=localStorage.getItem('geminiModel')||'gemini-2.5-flash';gem=true}else throw Error('Настрой Groq, OpenAI, Gemini или Custom');
      if(!key)throw Error('Нет API ключа');
      const ref=db.slice(0,600).map(a=>`${a.addr}|${a.type}|${a.price||''}`).join('\n');
      const prompt=`Ты умный разборщик курьерских сообщений. Сначала используй справочник Firebase. Если адрес найден/явно похож — ОБЯЗАТЕЛЬНО бери его type и price. Если нет — понимай смысл самостоятельно. Не требуй КВ/П: "1-24-4п" может быть подъездом, "4-1-105 (домофон 175)" и "1-20-36" — квартира. Гаражи и коттеджи — подъезд; Колизей — подъезд 150; Валерьяновка/Октябрьский 2500; дачи до домика 2800; дачи до КПП 2000; речка 1500; домик газовика 1000. Обычные F1/F2/F3: подъезд 150, квартира 300. ALLEY PUB: 600/900. Телефоны не адреса. Если уверенность <0.75 — questions, НЕ угадывай. JSON: {"orders":[{"point":"F1","address":"...","type":"under|flat|other","amount":150,"msgTime":"20:04","confidence":0.9}],"questions":[{"point":"F1","address":"...","msgTime":"20:04","reason":"...","confidence":0.5}]}. Справочник Firebase:\n${ref||'(пустой)'}\nСообщения:\n${text}`;
      let out;
      if(gem){const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system_instruction:{parts:[{text:prompt}]},contents:[{role:'user',parts:[{text:'Разбери.'}]}],generationConfig:{response_mime_type:'application/json',temperature:.1}})});const d=await r.json();if(d.error)throw Error(d.error.message);out=JSON.parse(d.candidates?.[0]?.content?.parts?.[0]?.text||'{}')}
      else{const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,temperature:.1,response_format:{type:'json_object'},messages:[{role:'system',content:prompt},{role:'user',content:'Разбери.'}]})});const raw=await r.text();const d=JSON.parse(raw);if(d.error)throw Error(d.error.message);let t=d.choices?.[0]?.message?.content||'{}';t=t.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/\s*```$/,'');out=JSON.parse(t)}
      const orders=Array.isArray(out)?out:(out.orders||[]);
      waEntries=orders.map(o=>{const cand=candidates(o.address,db),f=cand.find(x=>norm(x.a.addr)===norm(o.address))||(cand.length===1&&cand[0].score>=90?cand[0]:null),sp=special(o.address,text);let type=o.type||'under',amount=Number(o.amount)||0;if(f){type=f.a.type;amount=Number(f.a.price)||tariff(o.point,type)}else if(sp){type=sp.type;amount=sp.amount}else amount=tariff(o.point,type);return{point:o.point||'F1',amount,address:o.address||'',type:type==='flat'?'до квартиры':type==='other'?'другое':'до подъезда',msgTime:o.msgTime||''}});
      questions=(out.questions||[]).map(q=>({point:q.point||'F1',address:q.address||'',msgTime:q.msgTime||'',reason:q.reason||'Неоднозначный адрес'}));
      orders.filter(o=>Number(o.confidence)<.75).forEach(o=>{if(!questions.some(q=>norm(q.address)===norm(o.address)))questions.push({point:o.point||'F1',address:o.address||'',msgTime:o.msgTime||'',reason:'ИИ не уверен, как трактовать адрес'});});
      renderWAResult();
    }catch(e){showToast('Ошибка парсера: '+e.message,'error')}finally{btn.textContent='🤖 Разобрать';btn.disabled=false}
  };
  const oldRender=window.renderWAResult;
  window.renderWAResult=function(){oldRender();const result=document.getElementById('waResult'),list=document.getElementById('waList');if(questions.length){list.innerHTML+=renderQuestions()}result.style.display='block'};
})();
