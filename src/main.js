import { nextQuarter, makeSuggestions } from './engine.js';
import { saveState, loadState, listSaves, deleteSave } from './db.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let appState = null;
let uiPhase = "READY"; // READY -> EDITING -> SETTLED

function defaultCountry() {
  return {
    id: "AUT",
    name: "Austria",
    economy: {
      gdp: 1200,
      bottlenecks: { energy: 0.95, logistics: 0.92, skills: 0.9 }
    },
    prices: { cpi: 100, inflation: 0.01 },
    labor: { unemployment: 0.08, skill_share: 0.4 },
    finance: {
      tax: { cons: 0.05, income: 0.05, profit: 0.06, trade: 0.03 },
      spend: { edu: 20, health: 18, infra: 25, welfare: 15, def: 30, rnd: 5, admin: 6 },
      debt: { stock: 600, rate: 0.05, target: 0.9 }
    },
    mil: { army: { personnel: 350000, train: 0.45, org: 0.5, serviceable: 0.7 } },
    society: { stability: 0.7 }
  };
}

function defaultState(){
  return {
    save_id: "KV-1836",
    year: 1836, quarter: 1,
    seed: "KV-1836",
    active_country: "AUT",
    countries: { "AUT": defaultCountry() },
    policies: {
      invest_share: 18.0,
      rnd_share: 1.0,
      train_per_person: 20,
      maintain_per_eq: 15,
      tax_delta: 0.0
    },
    logs: []
  };
}

function currentCountry(){
  return appState.countries[appState.active_country];
}

function renderOverview(){
  const c = currentCountry();
  $('#labelYQ').textContent = `${appState.year} Q${appState.quarter}`;
  $('#labelGDP').textContent = c.economy.gdp.toFixed(2);
  $('#labelCPI').textContent = `${(c.prices.inflation*100).toFixed(2)}%`;
  $('#labelU').textContent = `${(c.labor.unemployment*100).toFixed(1)}%`;
  const taxTake = (0.22 + 0.4*(c.prices.inflation)) * c.economy.gdp;
  const spend = Object.values(c.finance.spend).reduce((a,b)=>a+b,0);
  const def = spend - taxTake;
  $('#labelDef').textContent = def.toFixed(2);
  $('#labelDebt').textContent = `${(c.finance.debt.stock / c.economy.gdp * 100).toFixed(1)}%`;
  const milScore = (c.mil.army.train*0.5 + c.mil.army.serviceable*0.5)*100;
  $('#labelMil').textContent = milScore.toFixed(1);
  $('#labelStab').textContent = `${(c.society.stability*100).toFixed(1)}%`;

  // inputs
  $('#inpInvestShare').value = appState.policies.invest_share;
  $('#inpRNDShare').value = appState.policies.rnd_share;
  $('#inpTrainPerCap').value = appState.policies.train_per_person;
  $('#inpMaintainPerEq').value = appState.policies.maintain_per_eq;
  $('#inpTaxDelta').value = appState.policies.tax_delta;
}

function setPhase(ph){
  uiPhase = ph;
  const btn = $('#btnPrimary');
  if (ph === "READY") btn.textContent = "生成建议值";
  if (ph === "EDITING") btn.textContent = "结算本季度";
  if (ph === "SETTLED") btn.textContent = "进入下季度";
}

async function init(){
  // register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  // storage persist
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch {}
  }

  appState = await loadState("KV-1836") || defaultState();
  $('#saveInfo').textContent = `存档：${appState.save_id}`;
  setPhase("READY");
  renderOverview();

  // tab switching
  $$('nav button[data-tab]').forEach(b => b.addEventListener('click', () => {
    $$('nav button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const tab = b.getAttribute('data-tab');
    ["overview","economy","population","finance","military","policies","logs"].forEach(t => {
      const el = document.getElementById(`tab-${t}`);
      if (!el) return;
      el.style.display = (t === tab) ? "block" : "none";
    });
  }));

  // main button logic
  $('#btnPrimary').addEventListener('click', async () => {
    if (uiPhase === "READY") {
      const sug = makeSuggestions(currentCountry());
      appState.policies = { ...appState.policies, ...sug };
      setPhase("EDITING");
      renderOverview();
    } else if (uiPhase === "EDITING") {
      // read inputs
      appState.policies.invest_share = parseFloat($('#inpInvestShare').value || "0") || 0;
      appState.policies.rnd_share = parseFloat($('#inpRNDShare').value || "0") || 0;
      appState.policies.train_per_person = parseFloat($('#inpTrainPerCap').value || "0") || 0;
      appState.policies.maintain_per_eq = parseFloat($('#inpMaintainPerEq').value || "0") || 0;
      appState.policies.tax_delta = parseFloat($('#inpTaxDelta').value || "0") || 0;

      // advance quarter
      const ns = nextQuarter({ ...appState, ...{ countries: appState.countries, policies: appState.policies } });
      appState = ns;
      $('#saveInfo').textContent = `存档：${appState.save_id}`;
      await saveState(appState);
      setPhase("SETTLED");
      renderOverview();
    } else if (uiPhase === "SETTLED") {
      setPhase("READY");
      renderOverview();
    }
  });

  // export / import
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(appState, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${appState.save_id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
  $('#btnImport').addEventListener('click', ()=> $('#fileImport').click());
  $('#fileImport').addEventListener('change', async (e)=>{
    const f = e.target.files[0];
    if (!f) return;
    const txt = await f.text();
    try {
      const obj = JSON.parse(txt);
      appState = obj;
      await saveState(appState);
      renderOverview();
      setPhase("READY");
    } catch (err) {
      alert("导入失败：" + err);
    }
  });

  // new country (quick wizard, minimal)
  $('#btnNew').addEventListener('click', async ()=>{
    const id = prompt("输入国家代码（3字母）：", "NEW");
    if (!id) return;
    const name = prompt("输入国家名称：", "Newland");
    const c = defaultCountry();
    c.id = id; c.name = name;
    appState.countries[id] = c;
    appState.active_country = id;
    await saveState(appState);
    renderOverview();
  });

  // saves list
  $('#btnSaves').addEventListener('click', async ()=>{
    const saves = await listSaves();
    alert("本地存档数：" + saves.length + "\n（当前实现每浏览器只有一个 key，可按需扩展多存档ID）");
  });

  renderOverview();
}

init();
