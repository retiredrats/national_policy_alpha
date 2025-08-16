// 数值与建议值引擎（极简可跑版）
// 确定性随机：xorshift128+
export function makeRNG(seedStr) {
  // simple string to 128-bit seed
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seedStr.length; i++) {
    const k = seedStr.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  let s0 = (h1 ^ h2) >>> 0, s1 = (h3 ^ h4) >>> 0;
  if (s0 === 0 && s1 === 0) s1 = 1;
  return function xorshift() {
    let x = s0, y = s1;
    s0 = y;
    x ^= x << 23;
    x ^= x >>> 17;
    x ^= y ^ (y >>> 26);
    s1 = x >>> 0;
    const t = (s0 + s1) >>> 0;
    return (t / 0x100000000);
  };
}

export function normal01(rng) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 用 logit 更新比率
export const clamp01 = x => Math.min(1, Math.max(0, x));
export function logit(x){ return Math.log(x/(1-x)); }
export function sigmoid(z){ return 1/(1+Math.exp(-z)); }

export function nextQuarter(state) {
  // 极简示例：只推进 GDP、通胀、失业、债务与军事训练度
  const s = JSON.parse(JSON.stringify(state));
  const seed = `${s.save_id}|${s.year}|${s.quarter}|${s.active_country}`;
  const rng = makeRNG(seed);
  const eps = 0.4 * (s._eps_prev ?? 0) + 0.02 * normal01(rng); // AR(1)
  s._eps_prev = eps;

  // 读取建议值（用户可在 UI 中改）
  const investShare = (s.policies?.invest_share ?? 0.18); // 投资/GDP
  const rndShare = (s.policies?.rnd_share ?? 0.01);
  const trainPerCap = (s.policies?.train_per_person ?? 20);
  const maintainPerEq = (s.policies?.maintain_per_eq ?? 15);
  const taxDelta = (s.policies?.tax_delta ?? 0);

  // 经济潜在增长+瓶颈修正
  const potential = 0.0075; // 0.75%/季
  const bottleneck = Math.min(s.economy.bottlenecks.energy, s.economy.bottlenecks.logistics, s.economy.bottlenecks.skills);
  const gdpGrowth = potential * bottleneck + 0.3*(investShare-0.18) + 0.1*(rndShare-0.01) + eps;
  s.economy.gdp = Math.max(1, s.economy.gdp * (1 + gdpGrowth));

  // 通胀与失业（玩具模型）
  s.prices.inflation = 0.6*(s.prices.inflation ?? 0.01) + 0.4*(gdpGrowth - potential) + 0.02*(1-bottleneck) + 0.01*normal01(rng);
  s.prices.cpi *= (1 + s.prices.inflation);
  s.labor.unemployment = clamp01((s.labor.unemployment ?? 0.08) - 0.5*(gdpGrowth - potential) + 0.01*normal01(rng));

  // 财政
  for (const k of Object.keys(s.finance.tax)) {
    s.finance.tax[k] = Math.max(0, s.finance.tax[k] + taxDelta/100); // 百分点微调
  }
  const taxTake = (0.22 + 0.4*(s.prices.inflation)) * s.economy.gdp; // 粗略税收
  const spend = Object.values(s.finance.spend).reduce((a,b)=>a+b,0);
  const def = spend - taxTake;
  s.finance.debt.stock = Math.max(0, s.finance.debt.stock + def + s.finance.debt.rate * s.finance.debt.stock);
  s.finance.debt.rate = Math.max(0.01, 0.04 + Math.max(0, s.finance.debt.stock / s.economy.gdp - 0.9) * 0.008 + 0.002*normal01(rng));

  // 军事训练与完好率
  const a = 0.15, b = 0.02;
  s.mil.army.train = sigmoid(logit(s.mil.army.train) + a*Math.log(1 + Math.max(0, trainPerCap)/100) - 0.02);
  s.mil.army.serviceable = sigmoid(logit(s.mil.army.serviceable) + b*Math.log(1 + Math.max(0, maintainPerEq)/100) - 0.01);

  // 社会稳定（通胀和失业的函数）
  const stab = clamp01(1 - 1.2*Math.max(0,s.prices.inflation) - 0.8*(s.labor.unemployment));
  s.society.stability = 0.6*(s.society.stability ?? 0.7) + 0.4*stab;

  // 推进季度
  s.quarter += 1;
  if (s.quarter > 4) { s.quarter = 1; s.year += 1; }

  return s;
}

export function makeSuggestions(state){
  // 给 UI 的建议值（可以被覆盖）
  const bottleneck = Math.min(state.economy.bottlenecks.energy, state.economy.bottlenecks.logistics, state.economy.bottlenecks.skills);
  const suggestInvest = Math.round((18 + (1-bottleneck)*8)*10)/10; // %
  const suggestRND = bottleneck < 0.9 ? 1.2 : 1.0;
  const suggestTrain = 20 + Math.max(0, 0.6 - state.mil.army.train)*60;
  const suggestMaintain = 15 + Math.max(0, 0.7 - state.mil.army.serviceable)*40;
  const debtRatio = state.finance.debt.stock / Math.max(1,state.economy.gdp);
  const suggestTaxDelta = debtRatio > state.finance.debt.target ? 0.2 : (debtRatio < state.finance.debt.target - 0.1 ? -0.2 : 0);
  return {
    invest_share: suggestInvest,
    rnd_share: Math.round(suggestRND*10)/10,
    train_per_person: Math.round(suggestTrain),
    maintain_per_eq: Math.round(suggestMaintain),
    tax_delta: Math.round(suggestTaxDelta*10)/10
  };
}
