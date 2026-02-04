const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "calorie_app_days_v2";
const SETTINGS_KEY = "calorie_app_settings_v1";

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function format1(n) {
  return (Math.round(n * 10) / 10).toFixed(1).replace(".0","");
}

function loadAllDays() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveAllDays(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function getDayData(key) {
  const all = loadAllDays();
  if (!all[key]) all[key] = { meals: [] };
  return all[key];
}
function setDayData(key, data) {
  const all = loadAllDays();
  all[key] = data;
  saveAllDays(all);
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { goalKcal: 0 }; }
  catch { return { goalKcal: 0 }; }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

let currentDay = todayKey();
let deferredPrompt = null;

function initDayPicker() {
  const dp = $("dayPicker");
  dp.value = currentDay;
  dp.addEventListener("change", () => {
    currentDay = dp.value || todayKey();
    render();
  });

  // quick hint
  $("dayHint").textContent = currentDay === todayKey() ? "(сьогодні)" : "";
}

function calcTotals(day) {
  const meals = day.meals || [];
  const eaten = meals.filter(m => m.eaten);

  const sumK = eaten.reduce((a,m)=>a+m.kcal,0);
  const sumP = eaten.reduce((a,m)=>a+m.p,0);
  const sumF = eaten.reduce((a,m)=>a+m.f,0);
  const sumC = eaten.reduce((a,m)=>a+m.c,0);

  return { meals, eaten, sumK, sumP, sumF, sumC };
}

function renderGoal(sumK) {
  const s = loadSettings();
  const goal = num($("goalKcal").value) || s.goalKcal || 0;

  const eaten = Math.round(sumK);
  const left = goal > 0 ? Math.round(goal - sumK) : 0;
  const pct = goal > 0 ? Math.round((sumK / goal) * 100) : 0;

  $("goalEaten").textContent = eaten;
  $("goalLeft").textContent = goal > 0 ? left : "—";
  $("goalPct").textContent = goal > 0 ? `${Math.max(0, pct)}%` : "—";

  const fill = goal > 0 ? Math.min(100, Math.max(0, (sumK / goal) * 100)) : 0;
  $("barFill").style.width = `${fill}%`;

  if (goal <= 0) {
    $("goalNote").textContent = "Встанови ціль — і буде прогрес на день.";
    return;
  }
  if (sumK <= goal) {
    $("goalNote").textContent = `До цілі залишилось: ${Math.max(0, left)} ккал.`;
  } else {
    $("goalNote").textContent = `Перебір: ${Math.abs(left)} ккал (не страшно — просто факт 😊)`;
  }
}

function drawDonut(p, f, c) {
  const canvas = $("donut");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const cx = w/2, cy = h/2;
  const r = Math.min(w,h) * 0.42;
  const thickness = r * 0.35;

  // background ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = "#eaf1ff";
  ctx.lineWidth = thickness;
  ctx.stroke();

  const total = p+f+c;
  if (total <= 0) {
    ctx.fillStyle = "#6b7a99";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Немає даних", cx, cy+5);
    return;
  }

  const segs = [
    { val: p, color: "#2db3ff" }, // protein
    { val: f, color: "#1e6dff" }, // fat
    { val: c, color: "#7aa8ff" }, // carbs
  ];

  let start = -Math.PI/2;
  segs.forEach(s => {
    const ang = (s.val/100) * Math.PI*2;
    if (ang <= 0) return;

    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + ang);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.stroke();

    start += ang;
  });

  // center label
  ctx.fillStyle = "#0b1b3a";
  ctx.font = "900 16px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Б / Ж / В", cx, cy-2);
  ctx.fillStyle = "#6b7a99";
  ctx.font = "800 13px system-ui";
  ctx.fillText(`${p}% • ${f}% • ${c}%`, cx, cy+18);
}

function drawWeekChart() {
  const canvas = $("weekChart");
  const ctx = canvas.getContext("2d");

  // make canvas sharp on retina
  const cssW = canvas.clientWidth || 900;
  const cssH = 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.clearRect(0,0,cssW,cssH);

  const all = loadAllDays();
  const keys = lastNDaysKeys(currentDay, 7); // includes currentDay
  const points = keys.map(k => {
    const day = all[k] || { meals: [] };
    const t = calcTotals(day);
    return { key: k, kcal: t.sumK };
  });

  const max = Math.max(100, ...points.map(p => p.kcal));
  const pad = 28;
  const chartW = cssW - pad*2;
  const chartH = cssH - pad*2;

  // bg
  roundRect(ctx, 0, 0, cssW, cssH, 16);
  ctx.fillStyle = "#fbfdff";
  ctx.fill();

  // grid lines
  ctx.strokeStyle = "#e6eeff";
  ctx.lineWidth = 1;
  for (let i=0;i<=4;i++){
    const y = pad + (chartH * i/4);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + chartW, y);
    ctx.stroke();
  }

  // labels
  ctx.fillStyle = "#6b7a99";
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText("ккал", 10, 18);

  // line + points
  const step = chartW / (points.length-1);
  const xy = points.map((p,i)=>{
    const x = pad + step*i;
    const y = pad + chartH - (p.kcal/max)*chartH;
    return { x, y, kcal: p.kcal, key: p.key };
  });

  ctx.strokeStyle = "#1e6dff";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  xy.forEach((pt,i)=>{
    if (i===0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();

  // points
  xy.forEach(pt=>{
    ctx.fillStyle = "#2db3ff";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI*2);
    ctx.fill();
  });

  // x labels (dd.mm)
  ctx.fillStyle = "#6b7a99";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  xy.forEach((pt,i)=>{
    const lbl = pt.key.slice(8,10) + "." + pt.key.slice(5,7);
    ctx.fillText(lbl, pt.x, cssH - 10);
  });

  // hint
  const sum7 = points.reduce((a,p)=>a+p.kcal,0);
  const avg = sum7 / points.length;
  $("weekHint").textContent = `Сума за 7 днів: ${Math.round(sum7)} ккал • середнє: ${Math.round(avg)} ккал/день.`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function lastNDaysKeys(fromKey, n) {
  const [yy,mm,dd] = fromKey.split("-").map(Number);
  const d = new Date(yy, mm-1, dd);
  const out = [];
  for (let i=n-1;i>=0;i--){
    const t = new Date(d);
    t.setDate(d.getDate() - i);
    const yyyy = t.getFullYear();
    const m = String(t.getMonth()+1).padStart(2,'0');
    const day = String(t.getDate()).padStart(2,'0');
    out.push(`${yyyy}-${m}-${day}`);
  }
  return out;
}

function renderList(meals) {
  const ul = $("mealList");
  ul.innerHTML = "";

  if (meals.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.style.padding = "8px 2px";
    li.textContent = "Поки що пусто. Додай першу страву 🙂";
    ul.appendChild(li);
    return;
  }

  meals
    .slice()
    .sort((a,b)=> (a.eaten === b.eaten ? b.createdAt - a.createdAt : a.eaten - b.eaten))
    .forEach(m => {
      const li = document.createElement("li");
      li.className = "item";

      const left = document.createElement("div");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = m.name;

      const meta = document.createElement("div");
      meta.className = "meta";
      const serv = m.serving ? ` • ${m.serving}г/порц.` : "";
      meta.textContent = `${Math.round(m.kcal)} ккал • Б ${format1(m.p)} • Ж ${format1(m.f)} • В ${format1(m.c)}${serv}`;

      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.className = "right";

      const pill = document.createElement("div");
      pill.className = "pill";
      pill.textContent = m.eaten ? "З’їв ✅" : "Не з’їв";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "checkbox";
      check.checked = m.eaten;
      check.title = "Відмітити як з’їв/не з’їв";
      check.addEventListener("change", () => {
        m.eaten = check.checked;
        const day = getDayData(currentDay);
        setDayData(currentDay, { meals: day.meals }); // save same ref
        render();
      });

      const del = document.createElement("button");
      del.className = "icon-btn";
      del.title = "Видалити";
      del.textContent = "🗑️";
      del.addEventListener("click", () => {
        const day = getDayData(currentDay);
        const next = day.meals.filter(x => x.id !== m.id);
        setDayData(currentDay, { meals: next });
        render();
      });

      right.appendChild(pill);
      right.appendChild(check);
      right.appendChild(del);

      li.appendChild(left);
      li.appendChild(right);
      ul.appendChild(li);
    });
}

function render() {
  $("dayPicker").value = currentDay;
  $("dayHint").textContent = currentDay === todayKey() ? "(сьогодні)" : "";

  const day = getDayData(currentDay);
  const { meals, sumK, sumP, sumF, sumC } = calcTotals(day);

  $("sumKcal").textContent = Math.round(sumK);
  $("sumP").textContent = format1(sumP);
  $("sumF").textContent = format1(sumF);
  $("sumC").textContent = format1(sumC);

  const totalMacro = sumP + sumF + sumC;
  const pctP = totalMacro ? Math.round((sumP/totalMacro)*100) : 0;
  const pctF = totalMacro ? Math.round((sumF/totalMacro)*100) : 0;
  const pctC = totalMacro ? Math.max(0, 100 - pctP - pctF) : 0;

  $("pctP").textContent = `${pctP}%`;
  $("pctF").textContent = `${pctF}%`;
  $("pctC").textContent = `${pctC}%`;

  drawDonut(pctP, pctF, pctC);
  renderGoal(sumK);
  renderList(meals);
  drawWeekChart();
}

function attachHandlers() {
  // save goal setting
  const settings = loadSettings();
  $("goalKcal").value = settings.goalKcal || "";
  $("goalKcal").addEventListener("input", () => {
    const s = loadSettings();
    s.goalKcal = num($("goalKcal").value);
    saveSettings(s);
    render();
  });

  $("mealForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const meal = {
      id: uid(),
      name: $("name").value.trim(),
      serving: num($("serving").value),
      kcal: num($("kcal").value),
      p: num($("p").value),
      f: num($("f").value),
      c: num($("c").value),
      eaten: $("eaten").checked,
      createdAt: Date.now()
    };

    if (!meal.name) return;

    const day = getDayData(currentDay);
    day.meals.push(meal);
    setDayData(currentDay, day);

    e.target.reset();
    $("autoHint").textContent = "";
    render();
  });

  $("clearAllBtn").addEventListener("click", () => {
    if (!confirm("Точно очистити ВСЕ? Це видалить всі дні та записи.")) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  $("resetDayBtn").addEventListener("click", () => {
    if (!confirm("Очистити тільки цей день?")) return;
    setDayData(currentDay, { meals: [] });
    render();
  });

  $("exportBtn").addEventListener("click", () => {
    const data = {
      settings: loadSettings(),
      days: loadAllDays()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calorie-app-export-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // AUTO: kcal from macros
  $("autoKcalBtn").addEventListener("click", () => {
    const p = num($("p").value), f = num($("f").value), c = num($("c").value);
    const kcal = Math.round(p*4 + f*9 + c*4);
    $("kcal").value = kcal;
    $("autoHint").textContent = `Ккал по формулі 4/9/4: ${kcal}. (Б=${p}г, Ж=${f}г, В=${c}г)`;
  });

  // AUTO: macros suggestion from kcal (simple “balanced” preset)
  $("autoMacroBtn").addEventListener("click", () => {
    const kcal = num($("kcal").value);
    if (kcal <= 0) {
      $("autoHint").textContent = "Впиши ккал, щоб отримати підказку.";
      return;
    }
    // Preset: 25% protein, 30% fat, 45% carbs (by calories)
    const pK = kcal * 0.25;
    const fK = kcal * 0.30;
    const cK = kcal * 0.45;

    const p = Math.round((pK/4) * 10) / 10;
    const f = Math.round((fK/9) * 10) / 10;
    const c = Math.round((cK/4) * 10) / 10;

    $("p").value = p;
    $("f").value = f;
    $("c").value = c;

    $("autoHint").textContent = `Підказка (25/30/45): Б≈${p}г, Ж≈${f}г, В≈${c}г. Можеш змінювати під себе.`;
  });

  // PWA install
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").style.display = "inline-block";
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").style.display = "none";
  });

  // redraw chart on resize
  window.addEventListener("resize", () => drawWeekChart());
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

// init
currentDay = todayKey();
initDayPicker();
attachHandlers();
registerSW();
render();
