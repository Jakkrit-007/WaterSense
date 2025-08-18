// WaterSense demo front-end (no external libs).
// Loads station meta, simulates live water-level updates, renders a faux map & line chart.

const REFRESH_MS = 5000;
const ALERT_LEVEL = 1.20;         // meters
const SURGE_PER_TICK = 0.15;      // meters within REFRESH_MS to be "watch"

const state = {
  stations: [],
  lastUpdated: null,
  alerts24h: [],
  series: [] // last 60 points (~5 min at 5s)
};

async function loadStations() {
  const res = await fetch('assets/data/sample-stations.json');
  const stations = await res.json();
  // Initialize dynamic fields
  stations.forEach(s => {
    s.level = +(0.7 + Math.random() * 0.4).toFixed(2); // 0.7–1.1 m
    s.prev = s.level;
    s.status = "ok";
  });
  state.stations = stations;
  state.series = stations.map(s => ({ id: s.id, name: s.name, values: [] }));
  tick(true);
}

function tick(initial=false) {
  // update levels
  let anyOnline = 0;
  let newAlerts = [];
  state.stations.forEach(s => {
    s.prev = s.level;
    // random walk + gentle trend
    let delta = (Math.random() - 0.45) * 0.08;
    // occasional surge
    if (Math.random() < 0.08) delta += Math.random() * 0.18;
    s.level = Math.max(0, +(s.level + delta).toFixed(2));
    s.online = Math.random() > 0.02; // ~98% online
    if (s.online) anyOnline++;

    // status logic
    let status = "ok";
    if (s.level >= ALERT_LEVEL) status = "alert";
    else if ((s.level - s.prev) >= SURGE_PER_TICK * 0.75) status = "watch";
    s.status = status;

    if (!initial && (status === "alert" || status === "watch")) {
      newAlerts.push({
        ts: new Date(),
        id: s.id,
        name: s.name,
        kind: status,
        level: s.level,
        delta: +(s.level - s.prev).toFixed(2)
      });
    }
  });

  // maintain 24h alerts (here: just keep last 200 for demo)
  state.alerts24h = [...newAlerts, ...state.alerts24h].slice(0, 200);
  state.lastUpdated = new Date();

  // push series (keep 60 points ≈ 5 min)
  state.series.forEach(ser => {
    const st = state.stations.find(x => x.id === ser.id);
    ser.values.push({ t: state.lastUpdated, v: st.level, status: st.status });
    if (ser.values.length > 60) ser.values.shift();
  });

  // render
  renderStats();
  renderMap();
  renderAlerts();
  renderTrend();

  // schedule next
  setTimeout(() => tick(false), REFRESH_MS);
}

function renderStats() {
  document.getElementById('stat-stations').textContent = state.stations.length;
  document.getElementById('stat-online').textContent = state.stations.filter(s => s.online).length;
  document.getElementById('stat-alerts').textContent = state.alerts24h.length;
  document.getElementById('stat-updated').textContent = state.lastUpdated.toLocaleTimeString();
}

function renderMap() {
  const el = document.getElementById('map-canvas');
  el.innerHTML = ""; // clear
  const w = el.clientWidth, h = el.clientHeight;
  
  // simple grid dots
  const svgNS = "https://www.google.com/maps/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  // fake rivers
  const river = document.createElementNS(svgNS, "path");
  river.setAttribute("d", `M 0 ${h*0.3} C ${w*0.3} ${h*0.25}, ${w*0.6} ${h*0.35}, ${w} ${h*0.3}
                           L ${w} ${h*0.4} C ${w*0.6} ${h*0.45}, ${w*0.3} ${h*0.35}, 0 ${h*0.4} Z`);
  river.setAttribute("fill", "#cfeaff");
  river.setAttribute("opacity", "0.8");
  svg.appendChild(river);

  state.stations.forEach((s, i) => {
    const cx = 40 + (i % 6) * ((w - 80) / 5);
    const cy = 60 + Math.floor(i / 6) * ((h - 120) / 3);
    const g = document.createElementNS(svgNS, "g");
    const color = s.status === "alert" ? "#ef4444" : (s.status === "watch" ? "#f59e0b" : "#10b981");
    const outer = document.createElementNS(svgNS, "circle");
    outer.setAttribute("cx", cx); outer.setAttribute("cy", cy); outer.setAttribute("r", 10);
    outer.setAttribute("fill", color); outer.setAttribute("stroke", "#0001");
    const label = document.createElementNS(svgNS, "text");
    label.textContent = s.name;
    label.setAttribute("x", cx + 14); label.setAttribute("y", cy + 4);
    label.setAttribute("font-size", "12"); label.setAttribute("fill", "#111");
    // tooltip
    outer.addEventListener("mouseenter", () => {
      label.textContent = `${s.name} • ${s.level.toFixed(2)} m`;
    });
    outer.addEventListener("mouseleave", () => {
      label.textContent = s.name;
    });
    g.appendChild(outer); g.appendChild(label); svg.appendChild(g);
  });
  el.appendChild(svg);
}

function renderAlerts() {
  const ul = document.getElementById('alert-list');
  ul.innerHTML = "";
  state.alerts24h.slice(0, 10).forEach(a => {
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'tag ' + (a.kind === "alert" ? "alert" : "watch");
    tag.textContent = a.kind === "alert" ? "ALERT" : "WATCH";
    const text = document.createElement('div');
    text.innerHTML = `<strong>${a.name}</strong> — ${a.level.toFixed(2)} m (Δ ${a.delta.toFixed(2)} m) <span class="muted">เวลา ${a.ts.toLocaleTimeString()}</span>`;
    li.appendChild(tag); li.appendChild(text);
    ul.appendChild(li);
  });
}

function renderTrend() {
  const canvas = document.getElementById('trend-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // axes
  ctx.save();
  ctx.translate(50, 20);
  const plotW = W - 70, plotH = H - 60;
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, plotW, plotH);

  // combine to average series
  const points = [];
  const len = Math.max(...state.series.map(s => s.values.length));
  for (let i=0;i<len;i++){
    const vs = state.series.map(s => s.values[i]?.v).filter(v => typeof v === 'number');
    const v = vs.length ? vs.reduce((a,b)=>a+b,0)/vs.length : null;
    const t = state.series[0].values[i]?.t || new Date();
    if (v !== null) points.push({t,v});
  }
  if (!points.length) { ctx.restore(); return; }

  const minV = Math.min(...points.map(p => p.v), 0);
  const maxV = Math.max(...points.map(p => p.v), ALERT_LEVEL + 0.2);

  // y grid
  const yTicks = 5;
  ctx.font = "12px system-ui";
  ctx.fillStyle = "#6b7280";
  for (let i=0;i<=yTicks;i++){
    const y = plotH - (i / yTicks) * plotH;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(plotW,y); ctx.stroke();
    const val = (minV + (i / yTicks) * (maxV - minV)).toFixed(2);
    ctx.fillText(val+" m", -40, y+4);
  }

  // alert line
  const yAlert = plotH - (ALERT_LEVEL - minV) * (plotH / (maxV - minV));
  ctx.strokeStyle = "#ef4444"; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(0, yAlert); ctx.lineTo(plotW, yAlert); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("เกณฑ์แจ้งเตือน 1.20 m", plotW - 170, yAlert - 6);

  // line
  ctx.strokeStyle = "#2e5bff"; ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = (i / (points.length - 1)) * plotW;
    const y = plotH - (p.v - minV) * (plotH / (maxV - minV));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.restore();
}

// bootstrap
loadStations().catch(err => {
  console.error(err);
  alert("โหลดข้อมูลสถานีไม่สำเร็จ");
});
