/* ==========================================================================
   Palestra — app di allenamento leggera, dati salvati in localStorage
   ========================================================================== */

const STORAGE_KEY = "palestra-data-v1";
const MAX_ALLENAMENTI_PER_PROGRAMMA = 5;

/* ---------- storage ---------- */

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { programs: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.programs)) return { programs: [] };
    return parsed;
  } catch (e) {
    return { programs: [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();

/* ---------- state (navigazione) ---------- */

let state = {
  screen: "home", // home | program | workout
  programId: null,
  workoutId: null,
  workoutTab: "esercizi", // esercizi | progressi
  session: null // { workoutId, inputs: { esercizioId: pesoString }, done: Set }
};

/* ---------- utils ---------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(iso) {
  if (!iso) return "-";
  const d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function findProgram(id) {
  return data.programs.find((p) => p.id === id) || null;
}

function findWorkout(program, id) {
  return program ? program.allenamenti.find((w) => w.id === id) || null : null;
}

function findExercise(workout, id) {
  return workout ? workout.esercizi.find((e) => e.id === id) || null : null;
}

/* ---------- rendering root ---------- */

const app = document.getElementById("app");

function render() {
  if (state.screen === "home") {
    app.innerHTML = renderHome();
  } else if (state.screen === "program") {
    app.innerHTML = renderProgram();
  } else if (state.screen === "workout") {
    app.innerHTML = state.session ? renderSession() : renderWorkout();
  }
}

/* ==========================================================================
   HOME — elenco programmi
   ========================================================================== */

function renderHome() {
  const programs = [...data.programs].sort((a, b) => b.createdAt - a.createdAt);

  let list;
  if (programs.length === 0) {
    list = `
      <div class="empty-state">
        <span class="big-icon">🏋️</span>
        Nessun programma ancora.<br>Creane uno per iniziare.
      </div>`;
  } else {
    list = programs.map((p) => {
      const days = daysUntil(p.scadenza);
      let badge = `<span class="badge badge-ok">${escapeHtml(formatDateShort(p.scadenza))}</span>`;
      if (days !== null) {
        if (days < 0) badge = `<span class="badge badge-danger">Scaduto</span>`;
        else if (days <= 14) badge = `<span class="badge badge-warn">Scade tra ${days}g</span>`;
      }
      return `
        <div class="card" data-action="open-program" data-id="${p.id}">
          <div class="card-row">
            <div>
              <p class="card-title">${escapeHtml(p.nome)}</p>
              <div class="card-meta">${p.allenamenti.length} allenament${p.allenamenti.length === 1 ? "o" : "i"}</div>
            </div>
            ${badge}
          </div>
        </div>`;
    }).join("");
  }

  return `
    <div class="topbar">
      <h1>I miei programmi</h1>
      <button class="icon-btn" data-action="new-program">+ Nuovo</button>
    </div>
    <div class="content">
      ${list}
    </div>
  `;
}

/* ==========================================================================
   PROGRAMMA — dettaglio + elenco allenamenti
   ========================================================================== */

function renderProgram() {
  const p = findProgram(state.programId);
  if (!p) { state.screen = "home"; return renderHome(); }

  const days = daysUntil(p.scadenza);
  let scadenzaBadge = `<span class="badge badge-ok">${escapeHtml(formatDateShort(p.scadenza))}</span>`;
  if (days !== null) {
    if (days < 0) scadenzaBadge = `<span class="badge badge-danger">Scaduto da ${Math.abs(days)}g</span>`;
    else if (days <= 14) scadenzaBadge = `<span class="badge badge-warn">Scade tra ${days}g</span>`;
  }

  const workouts = [...p.allenamenti].sort((a, b) => b.createdAt - a.createdAt);
  const workoutCards = workouts.map((w) => {
    const lastDate = lastWorkoutSessionDate(w);
    return `
      <div class="card" data-action="open-workout" data-id="${w.id}">
        <div class="card-row">
          <div>
            <p class="card-title">${escapeHtml(w.nome)}</p>
            <div class="card-meta">${w.esercizi.length} esercizi${lastDate ? " · ultima volta " + formatDateShort(lastDate) : ""}</div>
          </div>
        </div>
      </div>`;
  }).join("") || `<div class="empty-state">Nessun allenamento in questo programma.</div>`;

  const canAdd = p.allenamenti.length < MAX_ALLENAMENTI_PER_PROGRAMMA;

  return `
    <div class="topbar">
      <button class="back-btn" data-action="go-home">←</button>
      <h1>${escapeHtml(p.nome)}</h1>
    </div>
    <div class="content">
      <div class="info-box">
        <div class="card-row">
          <div>
            <div class="label">Scadenza scheda</div>
            <div class="value">${escapeHtml(formatDateShort(p.scadenza))}</div>
          </div>
          ${scadenzaBadge}
        </div>
        <div class="card-actions">
          <button class="btn btn-outline btn-small" data-action="edit-program" data-id="${p.id}">Modifica</button>
          <button class="btn btn-outline btn-small" data-action="delete-program" data-id="${p.id}">Elimina</button>
        </div>
      </div>

      <div class="section-title">Allenamenti (${p.allenamenti.length}/${MAX_ALLENAMENTI_PER_PROGRAMMA})</div>
      ${workoutCards}
      <button class="fab-add" data-action="new-workout" ${canAdd ? "" : "disabled"}>${canAdd ? "+ Nuovo allenamento" : "Limite di 5 allenamenti raggiunto"}</button>
    </div>
  `;
}

function lastWorkoutSessionDate(w) {
  let last = null;
  w.esercizi.forEach((e) => {
    (e.storico || []).forEach((s) => {
      if (!last || s.data > last) last = s.data;
    });
  });
  return last;
}

/* ==========================================================================
   ALLENAMENTO — esercizi + progressi
   ========================================================================== */

function renderWorkout() {
  const p = findProgram(state.programId);
  const w = findWorkout(p, state.workoutId);
  if (!p || !w) { state.screen = "program"; return renderProgram(); }

  const tabsHtml = `
    <div class="tabs">
      <button class="tab ${state.workoutTab === "esercizi" ? "active" : ""}" data-action="tab" data-tab="esercizi">Esercizi</button>
      <button class="tab ${state.workoutTab === "progressi" ? "active" : ""}" data-action="tab" data-tab="progressi">Progressi</button>
    </div>`;

  const body = state.workoutTab === "esercizi" ? renderEsercizi(w) : renderProgressi(w);

  return `
    <div class="topbar">
      <button class="back-btn" data-action="open-program" data-id="${p.id}">←</button>
      <div>
        <h1>${escapeHtml(w.nome)}</h1>
      </div>
      <button class="icon-btn" data-action="edit-workout" data-id="${w.id}">✎</button>
      <button class="icon-btn" data-action="delete-workout" data-id="${w.id}">🗑</button>
    </div>
    <div class="content">
      <button class="btn btn-primary btn-block" data-action="start-session" ${w.esercizi.length === 0 ? "disabled" : ""}>▶ Avvia allenamento</button>
      <div class="divider"></div>
      ${tabsHtml}
      ${body}
    </div>
  `;
}

function renderEsercizi(w) {
  const rows = w.esercizi.map((e) => `
    <div class="exercise-card">
      <div class="exercise-head">
        <div class="exercise-title">${escapeHtml(e.titolo)}</div>
        <div class="exercise-row-actions">
          <button class="icon-mini-btn" data-action="edit-exercise" data-id="${e.id}">✎</button>
          <button class="icon-mini-btn danger" data-action="delete-exercise" data-id="${e.id}">✕</button>
        </div>
      </div>
      <div class="exercise-stats">
        <span>Serie <b>${escapeHtml(e.serie)}</b></span>
        <span>Ripetizioni <b>${escapeHtml(e.ripetizioni)}</b></span>
        <span>Peso attuale <b>${escapeHtml(e.pesoAttuale)} kg</b></span>
      </div>
    </div>
  `).join("") || `<div class="empty-state">Nessun esercizio. Aggiungine uno.</div>`;

  return `
    ${rows}
    <button class="fab-add" data-action="new-exercise">+ Nuovo esercizio</button>
  `;
}

function renderProgressi(w) {
  if (w.esercizi.length === 0) {
    return `<div class="empty-state">Aggiungi esercizi per vedere i grafici dei progressi.</div>`;
  }
  return w.esercizi.map((e) => renderChartBlock(e)).join("");
}

function renderChartBlock(e) {
  const storico = [...(e.storico || [])].sort((a, b) => a.data.localeCompare(b.data));
  let deltaHtml = "";
  let chartHtml;

  if (storico.length === 0) {
    chartHtml = `<div class="chart-empty">Nessun dato ancora. Completa un allenamento per iniziare a tracciare i progressi.</div>`;
  } else if (storico.length === 1) {
    chartHtml = `<div class="chart-empty">Un solo dato registrato (${formatDateShort(storico[0].data)}: ${storico[0].peso} kg). Servono almeno due allenamenti per il grafico.</div>`;
  } else {
    chartHtml = buildSvgChart(storico);
    const first = storico[0].peso;
    const lastV = storico[storico.length - 1].peso;
    const delta = lastV - first;
    const sign = delta > 0 ? "+" : "";
    deltaHtml = `<div class="chart-delta ${delta > 0 ? "positive" : ""}">${sign}${delta} kg dal ${formatDateShort(storico[0].data)} (da ${first} a ${lastV} kg)</div>`;
  }

  return `
    <div class="chart-block">
      <div class="chart-block-title">${escapeHtml(e.titolo)}</div>
      ${deltaHtml}
      ${chartHtml}
    </div>
  `;
}

function buildSvgChart(storico) {
  const W = 300, H = 130, padL = 30, padR = 12, padT = 14, padB = 20;
  const weights = storico.map((s) => s.peso);
  let min = Math.min(...weights);
  let max = Math.max(...weights);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xFor = (i) => padL + (storico.length === 1 ? innerW / 2 : (i / (storico.length - 1)) * innerW);
  const yFor = (v) => padT + innerH - ((v - min) / span) * innerH;

  const points = storico.map((s, i) => [xFor(i), yFor(s.peso)]);
  const pathD = points.map((pt, i) => (i === 0 ? "M" : "L") + pt[0].toFixed(1) + "," + pt[1].toFixed(1)).join(" ");

  const dots = points.map((pt, i) =>
    `<circle class="chart-dot" cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="3"></circle>`
  ).join("");

  const gridLines = `
    <line class="chart-grid" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"></line>
    <line class="chart-grid" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"></line>
  `;

  const labelStep = storico.length > 6 ? Math.ceil(storico.length / 6) : 1;
  const lastIdx = storico.length - 1;
  const labels = storico.map((s, i) => {
    if (i % labelStep !== 0 && i !== lastIdx) return "";
    const anchor = i === 0 ? "start" : i === lastIdx ? "end" : "middle";
    return `<text class="chart-axis-label" x="${points[i][0].toFixed(1)}" y="${H - 4}" text-anchor="${anchor}">${formatDateShort(s.data)}</text>`;
  }).join("");

  const maxLabel = `<text class="chart-axis-label" x="${padL - 4}" y="${padT + 3}" text-anchor="end">${max}</text>`;
  const minLabel = `<text class="chart-axis-label" x="${padL - 4}" y="${H - padB}" text-anchor="end">${min}</text>`;

  return `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}
      <path class="chart-line" d="${pathD}"></path>
      ${dots}
      ${labels}
      ${maxLabel}
      ${minLabel}
    </svg>
  `;
}

/* ==========================================================================
   SESSIONE ATTIVA — segna il peso durante l'allenamento
   ========================================================================== */

function renderSession() {
  const p = findProgram(state.programId);
  const w = findWorkout(p, state.workoutId);
  if (!p || !w) { state.screen = "home"; state.session = null; return renderHome(); }

  const rows = w.esercizi.map((e) => {
    const val = state.session.inputs[e.id] ?? e.pesoAttuale;
    const isDone = state.session.done.has(e.id);
    return `
      <div class="session-exercise">
        <div class="exercise-title">${escapeHtml(e.titolo)}</div>
        <div class="session-target">${escapeHtml(e.serie)} serie × ${escapeHtml(e.ripetizioni)} ripetizioni</div>
        <div class="weight-input-row">
          <button class="done-toggle ${isDone ? "checked" : ""}" data-action="toggle-done" data-id="${e.id}">✓</button>
          <input type="number" inputmode="decimal" step="0.5" min="0" data-action="session-weight" data-id="${e.id}" value="${escapeHtml(val)}">
          <span class="unit">kg</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="topbar">
      <button class="back-btn" data-action="cancel-session">✕</button>
      <h1>${escapeHtml(w.nome)}</h1>
    </div>
    <div class="content">
      <div class="session-banner">Allenamento in corso — segna il peso sollevato per ogni esercizio</div>
      ${rows}
      <button class="btn btn-primary btn-block" data-action="finish-session">Termina allenamento</button>
      <div class="hint">Annulla per uscire senza salvare i progressi</div>
    </div>
  `;
}

/* ==========================================================================
   MODALI (form)
   ========================================================================== */

const modalRoot = document.getElementById("modal-root");

function openModal(title, fields, values, onSubmit) {
  const fieldsHtml = fields.map((f) => `
    <div class="field">
      <label>${escapeHtml(f.label)}</label>
      <input
        name="${f.name}"
        type="${f.type}"
        ${f.step ? `step="${f.step}"` : ""}
        ${f.min !== undefined ? `min="${f.min}"` : ""}
        value="${escapeHtml(values[f.name] ?? "")}"
        ${f.required ? "required" : ""}
        autocomplete="off"
      >
    </div>
  `).join("");

  modalRoot.innerHTML = `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal-sheet" data-stop>
        <h2>${escapeHtml(title)}</h2>
        <form id="modal-form">
          ${fieldsHtml}
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-action="close-modal">Annulla</button>
            <button type="submit" class="btn btn-primary">Salva</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const overlay = modalRoot.querySelector(".modal-overlay");
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) closeModal();
  });
  modalRoot.querySelector(".modal-sheet").addEventListener("click", (ev) => ev.stopPropagation());

  const form = modalRoot.querySelector("#modal-form");
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const result = {};
    fields.forEach((f) => {
      const raw = fd.get(f.name);
      result[f.name] = f.type === "number" ? parseFloat(raw) : raw.trim();
    });
    closeModal();
    onSubmit(result);
  });

  const firstInput = form.querySelector("input");
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
}

function closeModal() {
  modalRoot.innerHTML = "";
}

/* ==========================================================================
   AZIONI
   ========================================================================== */

function openProgramFormNew() {
  openModal("Nuovo programma", [
    { name: "nome", label: "Nome programma", type: "text", required: true },
    { name: "scadenza", label: "Data scadenza scheda", type: "date", required: true }
  ], {}, (values) => {
    data.programs.push({
      id: uid(),
      nome: values.nome,
      scadenza: values.scadenza,
      createdAt: Date.now(),
      allenamenti: []
    });
    saveData();
    render();
  });
}

function openProgramFormEdit(p) {
  openModal("Modifica programma", [
    { name: "nome", label: "Nome programma", type: "text", required: true },
    { name: "scadenza", label: "Data scadenza scheda", type: "date", required: true }
  ], { nome: p.nome, scadenza: p.scadenza }, (values) => {
    p.nome = values.nome;
    p.scadenza = values.scadenza;
    saveData();
    render();
  });
}

function openWorkoutFormNew(program) {
  openModal("Nuovo allenamento", [
    { name: "nome", label: "Nome allenamento", type: "text", required: true }
  ], {}, (values) => {
    program.allenamenti.push({
      id: uid(),
      nome: values.nome,
      createdAt: Date.now(),
      esercizi: []
    });
    saveData();
    render();
  });
}

function openWorkoutFormEdit(w) {
  openModal("Modifica allenamento", [
    { name: "nome", label: "Nome allenamento", type: "text", required: true }
  ], { nome: w.nome }, (values) => {
    w.nome = values.nome;
    saveData();
    render();
  });
}

function openExerciseFormNew(workout) {
  openModal("Nuovo esercizio", [
    { name: "titolo", label: "Titolo esercizio", type: "text", required: true },
    { name: "serie", label: "Serie", type: "number", step: "1", min: "0", required: true },
    { name: "ripetizioni", label: "Ripetizioni", type: "number", step: "1", min: "0", required: true },
    { name: "pesoAttuale", label: "Peso attuale (kg)", type: "number", step: "0.5", min: "0", required: true }
  ], {}, (values) => {
    workout.esercizi.push({
      id: uid(),
      titolo: values.titolo,
      serie: values.serie,
      ripetizioni: values.ripetizioni,
      pesoAttuale: values.pesoAttuale,
      storico: []
    });
    saveData();
    render();
  });
}

function openExerciseFormEdit(e) {
  openModal("Modifica esercizio", [
    { name: "titolo", label: "Titolo esercizio", type: "text", required: true },
    { name: "serie", label: "Serie", type: "number", step: "1", min: "0", required: true },
    { name: "ripetizioni", label: "Ripetizioni", type: "number", step: "1", min: "0", required: true },
    { name: "pesoAttuale", label: "Peso attuale (kg)", type: "number", step: "0.5", min: "0", required: true }
  ], e, (values) => {
    e.titolo = values.titolo;
    e.serie = values.serie;
    e.ripetizioni = values.ripetizioni;
    e.pesoAttuale = values.pesoAttuale;
    saveData();
    render();
  });
}

/* ---------- event delegation ---------- */

app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  const p = findProgram(state.programId);
  const w = p ? findWorkout(p, state.workoutId) : null;

  switch (action) {
    case "new-program":
      openProgramFormNew();
      break;

    case "open-program":
      state.programId = id;
      state.screen = "program";
      render();
      break;

    case "go-home":
      state.screen = "home";
      state.programId = null;
      render();
      break;

    case "edit-program": {
      const prog = findProgram(id);
      if (prog) openProgramFormEdit(prog);
      break;
    }

    case "delete-program": {
      const prog = findProgram(id);
      if (prog && confirm(`Eliminare il programma "${prog.nome}" e tutti i suoi allenamenti?`)) {
        data.programs = data.programs.filter((x) => x.id !== id);
        saveData();
        state.screen = "home";
        render();
      }
      break;
    }

    case "new-workout":
      if (p && p.allenamenti.length < MAX_ALLENAMENTI_PER_PROGRAMMA) openWorkoutFormNew(p);
      break;

    case "open-workout":
      state.workoutId = id;
      state.screen = "workout";
      state.workoutTab = "esercizi";
      render();
      break;

    case "edit-workout": {
      const wk = findWorkout(p, id);
      if (wk) openWorkoutFormEdit(wk);
      break;
    }

    case "delete-workout": {
      const wk = findWorkout(p, id);
      if (wk && p && confirm(`Eliminare l'allenamento "${wk.nome}"?`)) {
        p.allenamenti = p.allenamenti.filter((x) => x.id !== id);
        saveData();
        state.screen = "program";
        render();
      }
      break;
    }

    case "tab":
      state.workoutTab = el.dataset.tab;
      render();
      break;

    case "new-exercise":
      if (w) openExerciseFormNew(w);
      break;

    case "edit-exercise": {
      const ex = findExercise(w, id);
      if (ex) openExerciseFormEdit(ex);
      break;
    }

    case "delete-exercise": {
      const ex = findExercise(w, id);
      if (ex && w && confirm(`Eliminare l'esercizio "${ex.titolo}"?`)) {
        w.esercizi = w.esercizi.filter((x) => x.id !== id);
        saveData();
        render();
      }
      break;
    }

    case "start-session":
      if (w && w.esercizi.length > 0) {
        state.session = { workoutId: w.id, inputs: {}, done: new Set() };
        render();
      }
      break;

    case "toggle-done": {
      if (!state.session) break;
      if (state.session.done.has(id)) state.session.done.delete(id);
      else state.session.done.add(id);
      render();
      break;
    }

    case "cancel-session":
      if (confirm("Uscire senza salvare i progressi di questo allenamento?")) {
        state.session = null;
        render();
      }
      break;

    case "finish-session": {
      if (!w || !state.session) break;
      const today = todayISO();
      w.esercizi.forEach((e) => {
        const raw = state.session.inputs[e.id];
        const peso = raw !== undefined && raw !== "" ? parseFloat(raw) : e.pesoAttuale;
        if (isNaN(peso)) return;
        e.pesoAttuale = peso;
        e.storico = e.storico || [];
        e.storico.push({ data: today, peso });
      });
      saveData();
      state.session = null;
      render();
      break;
    }

    case "close-modal":
      closeModal();
      break;
  }
});

app.addEventListener("input", (ev) => {
  const el = ev.target.closest("[data-action='session-weight']");
  if (!el || !state.session) return;
  state.session.inputs[el.dataset.id] = el.value;
});

/* ---------- avvio ---------- */

render();
