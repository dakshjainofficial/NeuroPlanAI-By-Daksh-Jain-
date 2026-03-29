/* ════════════════════════════════════════════
   NEUROPLAN AI — script.js
   Full Application Logic
════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────
let subjects = [];
let studyPlan = [];
let points = 0;
let streak = 7;
let sessionsCompleted = 0;
let focusMinutes = 0;
let timerInterval = null;
let timeLeft = 25 * 60;
let timerRunning = false;
let barChartInst = null;
let pieChartInst = null;
let mindmapNodes = [];
let mindmapEdges = [];
let animFrame = null;

// ── INIT ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectRingGradient();
  renderBadges();
  updateSidebar();
  setRingProgress(1);

  // Preloader removal logic
  setTimeout(() => {
    const preloader = document.getElementById('preloader');
    preloader.classList.add('hidden');
    document.body.style.overflow = 'visible';
    // Small extra delay to clear from DOM if needed
    setTimeout(() => preloader.style.display = 'none', 600);
  }, 2800); // Allow loader-run animation to complete
});

function injectRingGradient() {
  const svg = document.querySelector('.ring-svg');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#6c63ff"/>
      <stop offset="100%" style="stop-color:#00e5ff"/>
    </linearGradient>`;
  svg.prepend(defs);
}

// ── NAVIGATION ─────────────────────────────────────
function showSection(name, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const titles = {
    dashboard: 'Dashboard', subjects: 'Subjects', planner: 'Study Plan',
    focus: 'Focus Mode', analytics: 'Analytics', mindmap: 'AI Mind Map'
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'analytics') setTimeout(renderCharts, 100);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ── TOAST ──────────────────────────────────────────
function showToast(msg, duration = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── SUBJECT MANAGEMENT ─────────────────────────────
function addSubject() {
  const name = document.getElementById('subjectName').value.trim();
  const diff = document.getElementById('subjectDifficulty').value;
  const days = parseInt(document.getElementById('subjectDays').value);
  const prep = parseInt(document.getElementById('subjectPrep').value);

  if (!name) return showToast('⚠ Please enter a subject name.');
  if (!days || days < 1) return showToast('⚠ Enter a valid number of days.');

  const sub = { id: Date.now(), name, difficulty: diff, days, prep };
  subjects.push(sub);

  // Reset form
  document.getElementById('subjectName').value = '';
  document.getElementById('subjectDays').value = '';
  document.getElementById('subjectPrep').value = 50;
  document.getElementById('prepDisplay').textContent = '50%';

  renderSubjectsList();
  updateDashboard();
  addPoints(10);
  showToast(`✅ "${name}" added! +10 XP`);
  checkBadges();
}

function removeSubject(id) {
  subjects = subjects.filter(s => s.id !== id);
  renderSubjectsList();
  updateDashboard();
  studyPlan = [];
  document.getElementById('planOutput').innerHTML = '';
  showToast('🗑 Subject removed.');
}

function renderSubjectsList() {
  const el = document.getElementById('subjectsList');
  if (!subjects.length) {
    el.innerHTML = '<div class="empty-state">No subjects added yet.</div>';
    return;
  }
  el.innerHTML = subjects.map(s => `
    <div class="subject-row" id="subrow-${s.id}">
      <div class="subject-row-main">
        <div class="subject-row-name">${escHtml(s.name)}</div>
        <div class="subject-meta">
          <span class="subject-tag tag-${s.difficulty}">${s.difficulty.toUpperCase()}</span>
          <span class="subject-tag tag-days">📅 ${s.days} day${s.days !== 1 ? 's' : ''}</span>
          <span class="subject-tag tag-prep">📈 ${s.prep}% ready</span>
        </div>
        <div class="prep-bar-wrap">
          <div class="prep-bar" style="width:${s.prep}%"></div>
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="removeSubject(${s.id})">Remove</button>
    </div>
  `).join('');
}

// ── DASHBOARD UPDATE ───────────────────────────────
function updateDashboard() {
  const count = subjects.length;
  document.getElementById('subjectCount').textContent = count;

  // Productivity score = avg preparation
  const score = count ? Math.round(subjects.reduce((a, s) => a + s.prep, 0) / count) : 0;
  document.getElementById('productivityScore').textContent = score + '%';
  document.getElementById('productivityBar').style.width = score + '%';

  // Weakest subject
  if (count) {
    const weakest = subjects.reduce((a, b) => a.prep < b.prep ? a : b);
    document.getElementById('weakestSubject').textContent = weakest.name;
    document.getElementById('weakestPrep').textContent = `${weakest.prep}% prepared — needs attention`;
    document.getElementById('statWeakest').style.borderColor = 'rgba(255,107,107,0.35)';
  } else {
    document.getElementById('weakestSubject').textContent = '—';
    document.getElementById('weakestPrep').textContent = 'Add subjects to detect';
    document.getElementById('statWeakest').style.borderColor = '';
  }

  // Burnout / low productivity from plan hours
  const totalHours = studyPlan.reduce((a, s) => a + s.hours, 0);
  document.getElementById('burnoutWarn').classList.toggle('hidden', totalHours <= 8);
  document.getElementById('lowProdWarn').classList.toggle('hidden', !(totalHours > 0 && totalHours < 2));
}

function updateSidebar() {
  document.getElementById('sidebarPoints').textContent = points;
  document.getElementById('pointsDisplay').textContent = points;
  document.getElementById('streakCount').textContent = streak + ' Day Streak';
}

function addPoints(n) {
  points += n;
  updateSidebar();
  checkBadges();
}

// ── PLAN GENERATION ────────────────────────────────
function computePriority(s) {
  // Adaptive logic: difficulty + proximity + low prep → higher score
  const diffScore = { easy: 1, medium: 2, hard: 3 }[s.difficulty];
  const daysScore = s.days <= 3 ? 3 : s.days <= 7 ? 2 : 1;
  const prepScore = s.prep < 30 ? 3 : s.prep < 60 ? 2 : 1;
  return diffScore * 1.5 + daysScore * 2 + prepScore * 1.8;
}

function priorityLabel(score) {
  if (score >= 8) return 'HIGH';
  if (score >= 5) return 'MEDIUM';
  return 'LOW';
}

function computeHours(s, score) {
  // Base hours from priority, scaled by difficulty and prep gap
  const base = score >= 8 ? 3 : score >= 5 ? 2 : 1;
  const gap = (100 - s.prep) / 100;
  return Math.max(1, Math.round((base + gap * 2) * 10) / 10);
}

function generatePlan() {
  if (!subjects.length) return showToast('⚠ Add at least one subject first.');

  studyPlan = subjects.map(s => {
    const score = computePriority(s);
    const label = priorityLabel(score);
    const hours = computeHours(s, score);
    return { ...s, score, priority: label, hours };
  }).sort((a, b) => b.score - a.score);

  renderPlan();
  updateDashboard();
  addPoints(25);
  updateTodayPreview();
  showToast('🧠 Smart plan generated! +25 XP');
  checkBadges();
}

function renderPlan() {
  const el = document.getElementById('planOutput');
  el.innerHTML = studyPlan.map((s, i) => `
    <div class="plan-card" style="animation-delay:${i * 0.07}s">
      <div>
        <div class="plan-priority-badge pri-${s.priority}">${s.priority}</div>
      </div>
      <div class="plan-body">
        <div class="plan-name">${escHtml(s.name)}</div>
        <div class="plan-meta">
          <strong>${s.difficulty.toUpperCase()}</strong> difficulty ·
          <strong>${s.days}</strong> day${s.days !== 1 ? 's' : ''} left ·
          <strong>${s.prep}%</strong> prepared<br>
          ${getAIReason(s)}
        </div>
      </div>
      <div class="plan-hours">
        <div class="plan-hours-num">${s.hours}h</div>
        <div class="plan-hours-lbl">today</div>
      </div>
    </div>
  `).join('');

  renderPredictions();
}

function getAIReason(s) {
  const parts = [];
  if (s.prep < 30) parts.push('🔴 Low prep — accelerate now');
  if (s.days <= 3) parts.push('⚡ Exam imminent — max urgency');
  if (s.difficulty === 'hard') parts.push('💡 Hard subject — deep focus needed');
  if (s.prep > 70 && s.days > 10) parts.push('✅ On track — maintain momentum');
  return parts.length ? `<span style="color:#9d97ff">${parts.join(' · ')}</span>` : '';
}

function updateTodayPreview() {
  const el = document.getElementById('todayPreview');
  if (!studyPlan.length) {
    el.innerHTML = '<div class="empty-state">Generate a plan to see tasks.</div>';
    return;
  }
  const top3 = studyPlan.slice(0, 3);
  el.innerHTML = top3.map(s => `
    <div class="plan-card" style="padding:14px 18px">
      <div><div class="plan-priority-badge pri-${s.priority}">${s.priority}</div></div>
      <div class="plan-body">
        <div class="plan-name" style="font-size:14px">${escHtml(s.name)}</div>
        <div class="plan-meta">${s.hours}h recommended today</div>
      </div>
    </div>
  `).join('');
}

function renderPredictions() {
  const el = document.getElementById('predictionPanel');
  el.innerHTML = studyPlan.map((s, i) => {
    const remaining = 100 - s.prep;
    const daysToFinish = remaining <= 0 ? 0 : Math.ceil(remaining / (s.hours * 4));
    return `
      <div class="pred-card" style="animation-delay:${i * 0.06}s">
        <div class="pred-subject">${escHtml(s.name)}</div>
        <div class="pred-days">${daysToFinish === 0 ? '✅' : daysToFinish + 'd'}</div>
        <div class="pred-label">${daysToFinish === 0 ? 'Already prepared!' : 'to finish syllabus'}</div>
        <div class="pred-label" style="margin-top:4px;color:#6c63ff">
          at current pace (${s.hours}h/day)
        </div>
      </div>`;
  }).join('');
  document.getElementById('predictionText').textContent =
    `${studyPlan.length} subject${studyPlan.length !== 1 ? 's' : ''} planned`;
}

// ── ANALYTICS CHARTS ───────────────────────────────
function renderCharts() {
  const barWrap = document.querySelector('#barChart').parentElement;
  const pieWrap = document.querySelector('#pieChart').parentElement;

  if (!subjects.length) {
    const emptyUI = (label) => `
      <div class="chart-empty">
        <div class="chart-empty-icon">📊</div>
        <p>No ${label} data available.<br><span style="font-size:12px;opacity:0.6">Add subjects to see your performance.</span></p>
      </div>`;
    barWrap.innerHTML = emptyUI('priority');
    pieWrap.innerHTML = emptyUI('time');
    return;
  }

  // Restore canvases if they were replaced by emptyUI
  if (barWrap.querySelector('.chart-empty')) barWrap.innerHTML = '<canvas id="barChart"></canvas>';
  if (pieWrap.querySelector('.chart-empty')) pieWrap.innerHTML = '<canvas id="pieChart"></canvas>';

  const labels = subjects.map(s => s.name);
  const scores = subjects.map(s => +computePriority(s).toFixed(1));
  const hours = studyPlan.length ? studyPlan.map(s => s.hours) : subjects.map(s => computeHours(s, computePriority(s)));

  Chart.defaults.color = '#7b80a0';
  Chart.defaults.font.family = 'Inter';

  // BAR CHART
  const barCanvas = document.getElementById('barChart');
  const barCtx = barCanvas.getContext('2d');

  // Create gradient for bars
  const barGrad = barCtx.createLinearGradient(0, 400, 0, 0);
  barGrad.addColorStop(0, 'rgba(108,99,255,0.1)');
  barGrad.addColorStop(1, '#6c63ff');

  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Priority Score',
        data: scores,
        backgroundColor: barGrad,
        borderColor: '#6c63ff',
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: '#00e5ff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1200, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1020',
          titleFont: { family: 'Outfit', size: 14 },
          bodyFont: { family: 'Inter', size: 13 },
          padding: 12, borderRadius: 10, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#7b80a0', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
          ticks: { color: '#7b80a0', font: { size: 11 } }
        }
      }
    }
  });

  // PIE CHART
  const pieCanvas = document.getElementById('pieChart');
  const pieCtx = pieCanvas.getContext('2d');
  if (pieChartInst) pieChartInst.destroy();

  const palette = ['#6c63ff', '#00e5ff', '#ff6b6b', '#ffd166', '#06d6a0', '#ff00aa', '#9d97ff'];

  pieChartInst = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: hours,
        backgroundColor: palette.map(c => c + 'cc'),
        borderColor: 'rgba(255,255,255,0.05)',
        borderWidth: 2,
        hoverOffset: 15,
        spacing: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1500, easing: 'easeOutElastic' },
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#7b80a0', padding: 20, font: { size: 12, family: 'Inter' }, usePointStyle: true }
        },
        tooltip: {
          backgroundColor: '#0d1020',
          padding: 12, borderRadius: 10, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1
        }
      },
      cutout: '70%',
      radius: '90%'
    }
  });
}

// ── POMODORO TIMER ─────────────────────────────────
const POMODORO = 25 * 60;
const CIRCUM = 2 * Math.PI * 96; // circumference for r=96

function setRingProgress(fraction) {
  const ring = document.getElementById('ringProgress');
  ring.style.strokeDashoffset = CIRCUM * (1 - fraction);
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  document.getElementById('focusMsg').classList.add('hidden');
  document.getElementById('timerStartBtn').textContent = '▶ Running';
  timerInterval = setInterval(() => {
    timeLeft--;
    renderTimerDisplay();
    setRingProgress(timeLeft / POMODORO);
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      sessionsCompleted++;
      focusMinutes += 25;
      const earned = 50;
      addPoints(earned);
      document.getElementById('sessionsCompleted').textContent = sessionsCompleted;
      document.getElementById('focusMinutes').textContent = focusMinutes;
      document.getElementById('focusPoints').textContent = sessionsCompleted * 50;
      const msg = document.getElementById('focusMsg');
      msg.textContent = `🎉 Session ${sessionsCompleted} complete! +${earned} XP earned. Take a 5-minute break.`;
      msg.classList.remove('hidden');
      document.getElementById('timerLabel').textContent = 'BREAK';
      document.getElementById('timerSession').textContent = `Session ${sessionsCompleted + 1} next`;
      document.getElementById('timerStartBtn').textContent = '▶ Start';
      showToast(`🎯 Focus session done! +${earned} XP`);
      checkBadges();
      timeLeft = POMODORO;
      renderTimerDisplay();
      setRingProgress(1);
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById('timerStartBtn').textContent = '▶ Resume';
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timeLeft = POMODORO;
  renderTimerDisplay();
  setRingProgress(1);
  document.getElementById('timerLabel').textContent = 'FOCUS';
  document.getElementById('timerStartBtn').textContent = '▶ Start';
  document.getElementById('focusMsg').classList.add('hidden');
}

function renderTimerDisplay() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  document.getElementById('timerDisplay').textContent = `${m}:${s}`;
}

// ── BADGES ─────────────────────────────────────────
function renderBadges() { /* initial state set in HTML */ }
function checkBadges() {
  const unlock = (id) => {
    const el = document.getElementById('badge-' + id);
    if (el && el.classList.contains('locked')) {
      el.classList.remove('locked');
      el.classList.add('unlocked');
      showToast(`🏅 Badge unlocked: ${el.querySelector('span').textContent}`);
    }
  };
  if (subjects.length >= 1) unlock('starter');
  if (studyPlan.length >= 1) unlock('planner');
  if (sessionsCompleted >= 1) unlock('focused');
  if (streak >= 7) unlock('streak');
  if (points >= 100) unlock('scholar');
  if (points >= 300) unlock('master');
}

// ── AI MIND MAP (UNIQUE FEATURE) ───────────────────
// Generates a topological knowledge graph from any topic using a
// built-in concept engine (no API required) — animated canvas rendering.

const conceptDB = {
  'machine learning': {
    core: ['Supervised Learning', 'Unsupervised Learning', 'Reinforcement Learning', 'Deep Learning', 'Neural Networks'],
    sub: {
      'Supervised Learning': ['Regression', 'Classification', 'SVM', 'Decision Trees'],
      'Unsupervised Learning': ['Clustering', 'PCA', 'Autoencoders'],
      'Deep Learning': ['CNN', 'RNN', 'Transformers', 'GANs'],
      'Neural Networks': ['Backpropagation', 'Activation Functions', 'Weights & Biases'],
      'Reinforcement Learning': ['Q-Learning', 'Policy Gradient', 'Reward Functions'],
    }
  },
  'calculus': {
    core: ['Limits', 'Derivatives', 'Integrals', 'Series', 'Multivariable Calculus'],
    sub: {
      'Limits': ['Continuity', 'L\'Hôpital\'s Rule', 'Epsilon-Delta'],
      'Derivatives': ['Chain Rule', 'Product Rule', 'Implicit Diff.'],
      'Integrals': ['Riemann Sum', 'Fundamental Theorem', 'Integration by Parts'],
      'Series': ['Taylor Series', 'Fourier Series', 'Convergence'],
      'Multivariable Calculus': ['Partial Derivatives', 'Gradient', 'Vector Fields'],
    }
  },
  'world war ii': {
    core: ['Causes', 'Major Battles', 'Key Figures', 'Holocaust', 'End & Aftermath'],
    sub: {
      'Causes': ['Treaty of Versailles', 'Rise of Nazism', 'Japanese Expansion'],
      'Major Battles': ['Battle of Britain', 'Stalingrad', 'D-Day', 'Midway'],
      'Key Figures': ['Churchill', 'Hitler', 'Roosevelt', 'Stalin', 'Eisenhower'],
      'Holocaust': ['Concentration Camps', 'Nuremberg Laws', 'Genocide'],
      'End & Aftermath': ['VE Day', 'Hiroshima', 'Cold War Origins', 'UN Founded'],
    }
  },
  'data structures': {
    core: ['Arrays', 'Linked Lists', 'Trees', 'Graphs', 'Hash Tables'],
    sub: {
      'Arrays': ['Static vs Dynamic', '2D Arrays', 'Sorting'],
      'Linked Lists': ['Singly Linked', 'Doubly Linked', 'Circular'],
      'Trees': ['BST', 'AVL Tree', 'Heap', 'Trie'],
      'Graphs': ['BFS', 'DFS', 'Dijkstra', 'Topological Sort'],
      'Hash Tables': ['Collision Handling', 'Open Addressing', 'Chaining'],
    }
  },
  'physics': {
    core: ['Mechanics', 'Thermodynamics', 'Electromagnetism', 'Optics', 'Quantum Physics'],
    sub: {
      'Mechanics': ['Newton\'s Laws', 'Kinematics', 'Energy & Work', 'Momentum'],
      'Thermodynamics': ['Laws of Thermo', 'Entropy', 'Heat Transfer'],
      'Electromagnetism': ['Coulomb\'s Law', 'Maxwell\'s Equations', 'Inductance'],
      'Optics': ['Reflection', 'Refraction', 'Wave-Particle Duality'],
      'Quantum Physics': ['Photoelectric Effect', 'Schrödinger\'s Eq.', 'Uncertainty Principle'],
    }
  },
};

function getConceptData(topic) {
  const key = topic.toLowerCase().trim();
  if (conceptDB[key]) return conceptDB[key];
  // Generic fallback — smart generation from the topic name
  const words = topic.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1));
  const root = words.join(' ');
  const coreAspects = [
    'Introduction & History', 'Core Principles', 'Key Concepts',
    'Applications', 'Advanced Topics', 'Current Research'
  ];
  const subMap = {};
  coreAspects.forEach(a => {
    subMap[a] = [
      `${a} — Basics`, `${a} — Methods`, `${a} — Examples`
    ];
  });
  return { core: coreAspects, sub: subMap };
}

function generateMindMap() {
  const topic = document.getElementById('mindmapTopic').value.trim();
  if (!topic) return showToast('⚠ Enter a topic to map.');
  const data = getConceptData(topic);
  buildMindMapGraph(topic, data);
  document.getElementById('mindmapEmpty').style.display = 'none';
  addPoints(15);
  showToast(`🗺 Mind map generated for "${topic}"! +15 XP`);
  checkBadges();
}

function buildMindMapGraph(rootLabel, data) {
  const canvas = document.getElementById('mindmapCanvas');
  const container = document.getElementById('mindmapContainer');
  canvas.width = container.clientWidth;
  canvas.height = 460;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const palette = ['#6c63ff', '#00e5ff', '#ff6b6b', '#ffd166', '#06d6a0', '#ff00aa', '#9d97ff', '#ff9f40'];

  // Build nodes
  mindmapNodes = [];
  mindmapEdges = [];

  // Root node
  mindmapNodes.push({ id: 0, label: rootLabel, x: cx, y: cy, r: 42, color: '#6c63ff', type: 'root', vx: 0, vy: 0 });

  const coreNodes = data.core.slice(0, 6);
  const angleStep = (2 * Math.PI) / coreNodes.length;
  const coreR = Math.min(cx, cy) * 0.42;

  coreNodes.forEach((name, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const nx = cx + coreR * Math.cos(angle);
    const ny = cy + coreR * Math.sin(angle);
    const nid = i + 1;
    mindmapNodes.push({ id: nid, label: name, x: nx, y: ny, r: 30, color: palette[i % palette.length], type: 'core', vx: 0, vy: 0 });
    mindmapEdges.push({ from: 0, to: nid, color: palette[i % palette.length] });

    // Sub-nodes
    const subs = (data.sub[name] || []).slice(0, 3);
    const subAngleStep = Math.PI / (subs.length + 1);
    const baseAngle = angle - Math.PI / (subs.length + 1) * (subs.length - 1) / 2;
    const subR = coreR * 0.6;
    subs.forEach((sname, j) => {
      const sa = baseAngle + subAngleStep * j;
      const sx = nx + subR * Math.cos(sa);
      const sy = ny + subR * Math.sin(sa);
      const sid = mindmapNodes.length;
      mindmapNodes.push({ id: sid, label: sname, x: sx, y: sy, r: 20, color: palette[i % palette.length], type: 'sub', vx: 0, vy: 0 });
      mindmapEdges.push({ from: nid, to: sid, color: palette[i % palette.length] + '88' });
    });
  });

  // Clamp nodes to canvas
  mindmapNodes.forEach(n => {
    n.x = Math.max(n.r + 10, Math.min(canvas.width - n.r - 10, n.x));
    n.y = Math.max(n.r + 10, Math.min(canvas.height - n.r - 10, n.y));
  });

  // Animate
  if (animFrame) cancelAnimationFrame(animFrame);
  let alpha = 0;
  function draw() {
    if (alpha < 1) alpha = Math.min(1, alpha + 0.03);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = alpha;

    // Draw edges
    mindmapEdges.forEach(e => {
      const from = mindmapNodes[e.from];
      const to = mindmapNodes[e.to];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      // Curved edge
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2 - 20;
      ctx.quadraticCurveTo(mx, my, to.x, to.y);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.color.length > 7 ? 1 : 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
    });

    // Draw nodes
    mindmapNodes.forEach(n => {
      // Glow
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.5);
      grd.addColorStop(0, n.color + '44');
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.color + '33';
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = n.type === 'root' ? 2.5 : 1.5;
      ctx.stroke();

      // Label
      const fontSize = n.type === 'root' ? 14 : n.type === 'core' ? 12 : 11;
      ctx.font = `${n.type === 'root' ? '700' : '500'} ${fontSize}px Outfit, sans-serif`;
      ctx.fillStyle = '#e8eaff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Word wrap
      const words = n.label.split(' ');
      const lineH = fontSize * 1.3;
      if (words.length <= 2 || n.r >= 36) {
        const lines = [];
        let cur = '';
        words.forEach(w => {
          const test = cur ? cur + ' ' + w : w;
          if (ctx.measureText(test).width > n.r * 1.8 && cur) {
            lines.push(cur); cur = w;
          } else { cur = test; }
        });
        if (cur) lines.push(cur);
        const startY = n.y - (lines.length - 1) * lineH / 2;
        lines.forEach((line, li) => ctx.fillText(line, n.x, startY + li * lineH));
      } else {
        ctx.fillText(n.label.split(' ').slice(0, 2).join(' '), n.x, n.y - lineH / 2);
        ctx.fillText(n.label.split(' ').slice(2).join(' '), n.x, n.y + lineH / 2);
      }
    });

    ctx.globalAlpha = 1;
    animFrame = requestAnimationFrame(draw);
    if (alpha >= 1) {
      // Stop redrawing once stable (no physics in this version for simplicity)
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  }
  draw();
}

// ── UTILITY ────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}