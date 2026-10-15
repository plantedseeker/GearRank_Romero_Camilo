// GearRank: adaptación de CourseMash (comparación A/B + Elo + ranking).
// 1) DATOS: 12 periféricos ficticios y precios ilustrativos en COP.
const productos = [
  { id: "M1", nombre: "Mouse Pulse M1", categoria: "MOU", precio: 89900, icono: "🖱️", detalle: "Opción de entrada y diseño ligero" },
  { id: "M2", nombre: "Mouse Vector M2", categoria: "MOU", precio: 159900, icono: "🖱️", detalle: "Agarre cómodo para jugar" },
  { id: "M3", nombre: "Mouse Phantom M3", categoria: "MOU", precio: 229900, icono: "🖱️", detalle: "Diseño gaming avanzado" },
  { id: "T1", nombre: "Teclado Spark K60", categoria: "TEC", precio: 179900, icono: "⌨️", detalle: "Formato compacto" },
  { id: "T2", nombre: "Teclado Orbit TKL", categoria: "TEC", precio: 279900, icono: "⌨️", detalle: "Diseño sin teclado numérico" },
  { id: "T3", nombre: "Teclado Aurora 75", categoria: "TEC", precio: 429900, icono: "⌨️", detalle: "Formato 75% para escritorio" },
  { id: "A1", nombre: "Audífonos Echo H1", categoria: "AUD", precio: 149900, icono: "🎧", detalle: "Para sesiones casuales" },
  { id: "A2", nombre: "Audífonos Sonic H7", categoria: "AUD", precio: 319900, icono: "🎧", detalle: "Enfoque en inmersión" },
  { id: "C1", nombre: "Control Drift C1", categoria: "CON", precio: 189900, icono: "🎮", detalle: "Diseño versátil" },
  { id: "C2", nombre: "Control Titan C2", categoria: "CON", precio: 359900, icono: "🎮", detalle: "Diseño premium" },
  { id: "P1", nombre: "Monitor Swift 24", categoria: "MON", precio: 699900, icono: "🖥️", detalle: "Pantalla de 24 pulgadas" },
  { id: "P2", nombre: "Monitor Horizon 27", categoria: "MON", precio: 1299900, icono: "🖥️", detalle: "Pantalla de 27 pulgadas" }
];

// "Categoría preferida" sustituye a "segmento" de CourseMash.
const categorias = {
  TODAS: "Todas las categorías",
  MOU: "Mouse",
  TEC: "Teclados",
  AUD: "Audífonos",
  CON: "Controles",
  MON: "Monitores"
};

// Los contextos representan decisiones humanas sobre la compra.
const contextos = {
  VALOR: "¿Cuál comprarías por su relación precio-beneficio?",
  JUEGO: "¿Cuál preferirías para jugar competitivamente?",
  CONFORT: "¿Cuál elegirías para sesiones largas de juego?"
};

const RATING_INICIAL = 1000;
const K = 32;
const STORAGE_KEY = "gearrank_state_v1";
const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0
});

// 2) ESTADO: ranking general + rankings por categoría/contexto + votos.
// Se mantiene el concepto de "buckets" del proyecto CourseMash.
function defaultState() {
  const rankingGeneral = {};
  productos.forEach(p => { rankingGeneral[p.id] = RATING_INICIAL; });

  const buckets = {};
  for (const categoria of Object.keys(categorias)) {
    for (const contexto of Object.keys(contextos)) {
      buckets[`${categoria}__${contexto}`] = { ...rankingGeneral };
    }
  }
  return { rankingGeneral, buckets, votes: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw);
    const fresh = defaultState();
    if (!saved || !Array.isArray(saved.votes)) return fresh;
    if (!saved.rankingGeneral || !saved.buckets) return fresh;
    const valid = Object.keys(fresh.rankingGeneral).every(id =>
      Number.isFinite(saved.rankingGeneral[id])
    ) && Object.keys(fresh.buckets).every(key =>
      saved.buckets[key] &&
      Object.keys(fresh.rankingGeneral).every(id =>
        Number.isFinite(saved.buckets[key][id])
      )
    );
    return valid ? saved : fresh;
  } catch (error) {
    return defaultState(); // También funciona si el visualizador bloquea storage.
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Los votos siguen funcionando durante esta sesión aunque storage esté bloqueado.
  }
}

let state = loadState();

// 3) ELO: fórmulas originales de CourseMash, ahora con IDs de productos.
function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

function updateElo(ratings, idA, idB, winner) {
  const ra = ratings[idA];
  const rb = ratings[idB];
  const ea = expectedScore(ra, rb);
  const eb = expectedScore(rb, ra);
  const sa = winner === "A" ? 1 : 0;
  const sb = winner === "B" ? 1 : 0;

  ratings[idA] = ra + K * (sa - ea);
  ratings[idB] = rb + K * (sb - eb);

  return {
    cambioA: ratings[idA] - ra,
    cambioB: ratings[idB] - rb
  };
}

function bucketKey(categoria, contexto) {
  return `${categoria}__${contexto}`;
}

function topN(ratings, cantidad) {
  return productos
    .map(p => ({ ...p, rating: ratings[p.id] }))
    .sort((a, b) => b.rating - a.rating || a.precio - b.precio)
    .slice(0, cantidad);
}

// 4) INTERFAZ Y SELECCIÓN DE DOS PRODUCTOS DISTINTOS.
const categorySelect = document.getElementById("categorySelect");
const contextSelect = document.getElementById("contextSelect");
const budgetInput = document.getElementById("budgetInput");
const voteFeedback = document.getElementById("voteFeedback");
let currentA = null;
let currentB = null;
let lastPair = "";

function fillSelect(select, data) {
  for (const [key, label] of Object.entries(data)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label;
    select.appendChild(option);
  }
}

fillSelect(categorySelect, categorias);
fillSelect(contextSelect, contextos);
categorySelect.value = "TODAS";
contextSelect.value = "VALOR";

function pairKey(a, b) {
  return [a.id, b.id].sort().join("|");
}

function randomPair() {
  const categoria = categorySelect.value;
  const disponibles = productos.filter(p =>
    categoria === "TODAS" || p.categoria === categoria
  );
  let a, b;
  let intentos = 0;
  do {
    const i = Math.floor(Math.random() * disponibles.length);
    let j = Math.floor(Math.random() * (disponibles.length - 1));
    if (j >= i) j += 1;
    a = disponibles[i];
    b = disponibles[j];
    intentos++;
  } while (disponibles.length > 2 && pairKey(a, b) === lastPair && intentos < 30);
  lastPair = pairKey(a, b);
  return [a, b];
}

function showProduct(producto, letra) {
  const rating = state.buckets[bucketKey(categorySelect.value, contextSelect.value)][producto.id];
  document.getElementById(`icon${letra}`).textContent = producto.icono;
  document.getElementById(`name${letra}`).textContent = producto.nombre;
  document.getElementById(`category${letra}`).textContent = categorias[producto.categoria];
  document.getElementById(`detail${letra}`).textContent = producto.detalle;
  document.getElementById(`price${letra}`).textContent = formatoCOP.format(producto.precio);
  document.getElementById(`rating${letra}`).textContent = `Elo contextual: ${rating.toFixed(1)}`;
  document.getElementById(`btn${letra}`).setAttribute(
    "aria-label", `Elegir ${producto.nombre} por ${formatoCOP.format(producto.precio)}`
  );
}

function newDuel() {
  [currentA, currentB] = randomPair();
  document.getElementById("question").textContent = contextos[contextSelect.value];
  showProduct(currentA, "A");
  showProduct(currentB, "B");
}

// 5) UN VOTO ACTUALIZA EL RANKING GENERAL Y EL BUCKET SELECCIONADO.
function vote(winner) {
  if (!currentA || !currentB) return;
  const categoria = categorySelect.value;
  const contexto = contextSelect.value;
  const bucket = state.buckets[bucketKey(categoria, contexto)];
  const cambioGeneral = updateElo(state.rankingGeneral, currentA.id, currentB.id, winner);
  updateElo(bucket, currentA.id, currentB.id, winner);

  const ganador = winner === "A" ? currentA : currentB;
  const perdedor = winner === "A" ? currentB : currentA;
  const diferencia = winner === "A" ? cambioGeneral.cambioA : cambioGeneral.cambioB;
  state.votes.push({
    fecha: new Date().toISOString(),
    categoriaPreferida: categorias[categoria],
    contexto: contextos[contexto],
    productoA: currentA.nombre,
    productoB: currentB.nombre,
    ganador: ganador.nombre,
    perdedor: perdedor.nombre,
    cambioEloGeneralGanador: diferencia.toFixed(2)
  });
  saveState();
  voteFeedback.textContent =
    `✅ Elegiste ${ganador.nombre}: +${diferencia.toFixed(1)} Elo general. ` +
    `${perdedor.nombre} pierde ${diferencia.toFixed(1)} puntos.`;
  newDuel();
  renderResults();
}

// 6) RANKING GENERAL: acumula TODOS los votos, sin filtros.
function renderRanking() {
  const ordered = topN(state.rankingGeneral, productos.length);
  document.getElementById("topBox").innerHTML = ordered.map((p, i) => `
    <div class="rank-row">
      <span class="rank-position">${i + 1}</span>
      <span>
        <span class="rank-title">${p.icono} ${p.nombre}</span>
        <span class="rank-meta">${categorias[p.categoria]} · ${formatoCOP.format(p.precio)}</span>
      </span>
      <span class="rank-score">${p.rating.toFixed(1)}</span>
    </div>`).join("");
}

// 7) PERSONALIZACIÓN: categoría y presupuesto FILTRAN; bucket Elo ORDENA.
function renderRecommendations() {
  const categoria = categorySelect.value;
  const contexto = contextSelect.value;
  const textoPresupuesto = budgetInput.value.trim();
  const presupuesto = textoPresupuesto === "" ? Infinity : Number(textoPresupuesto);
  const bucket = state.buckets[bucketKey(categoria, contexto)];
  const sugeridos = productos
    .filter(p => (categoria === "TODAS" || p.categoria === categoria) &&
      p.precio <= presupuesto)
    .sort((a, b) => bucket[b.id] - bucket[a.id] ||
      state.rankingGeneral[b.id] - state.rankingGeneral[a.id] ||
      a.precio - b.precio)
    .slice(0, 5);

  document.getElementById("filterSummary").textContent =
    `${categorias[categoria]} · ${textoPresupuesto === "" ?
      "Sin límite de presupuesto" : "Hasta " + formatoCOP.format(presupuesto)} · ` +
    `${sugeridos.length} recomendación(es)`;

  const container = document.getElementById("recommendationBox");
  if (sugeridos.length === 0) {
    container.innerHTML = `<p class="empty">No hay productos dentro de ese presupuesto.
      Auméntalo o elige otra categoría.</p>`;
    return;
  }
  container.innerHTML = sugeridos.map((p, i) => `
    <div class="rank-row">
      <span class="rank-position">${i + 1}</span>
      <span>
        <span class="rank-title">${p.icono} ${p.nombre}</span>
        <span class="rank-meta">${categorias[p.categoria]} · ${formatoCOP.format(p.precio)}</span>
      </span>
      <span class="rank-score">${bucket[p.id].toFixed(1)}</span>
    </div>`).join("");
}

function renderCatalog() {
  document.getElementById("catalogBox").innerHTML = productos.map(p => `
    <article class="catalog-card">
      <span class="catalog-icon" aria-hidden="true">${p.icono}</span>
      <h3>${p.nombre}</h3>
      <p>${categorias[p.categoria]}</p>
      <p>${p.detalle}</p>
      <strong>${formatoCOP.format(p.precio)}</strong>
    </article>`).join("");
}

function renderResults() {
  document.getElementById("productCount").textContent = productos.length;
  document.getElementById("voteCount").textContent = state.votes.length;
  renderRanking();
  renderRecommendations();
}

// 8) EVENTOS: votar, comparar otra pareja, reiniciar y exportar CSV.
document.getElementById("btnA").addEventListener("click", () => vote("A"));
document.getElementById("btnB").addEventListener("click", () => vote("B"));
document.getElementById("btnNewPair").addEventListener("click", newDuel);

for (const select of [categorySelect, contextSelect]) {
  select.addEventListener("change", () => {
    lastPair = "";
    voteFeedback.textContent = "Elige A o B para actualizar este ranking.";
    newDuel();
    renderResults();
  });
}
budgetInput.addEventListener("input", renderRecommendations);

document.getElementById("btnReset").addEventListener("click", () => {
  if (!confirm("¿Borrar todos los votos y reiniciar Elo a 1000?")) return;
  state = defaultState();
  saveState();
  lastPair = "";
  voteFeedback.textContent = "Ranking reiniciado. Todos tienen 1.000 Elo.";
  newDuel();
  renderResults();
});

document.getElementById("btnExport").addEventListener("click", () => {
  if (state.votes.length === 0) {
    alert("Todavía no hay votos para exportar.");
    return;
  }
  const headers = [
    "fecha", "categoriaPreferida", "contexto", "productoA", "productoB",
    "ganador", "perdedor", "cambioEloGeneralGanador"
  ];
  const csv = [headers.join(";")];
  for (const voto of state.votes) {
    csv.push(headers.map(h => `"${String(voto[h] ?? "").replace(/"/g, '""')}"`).join(";"));
  }
  const blob = new Blob(["\uFEFF" + csv.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gearrank_votos.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Inicio: funciona como página estática local y en GitHub Pages.
renderCatalog();
newDuel();
renderResults();
