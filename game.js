const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const arena = { x: 34, y: 30, w: W - 68, h: H - 60 };

const $ = (id) => document.getElementById(id);
const scoreValue = $("scoreValue");
const timeValue = $("timeValue");
const roundValue = $("roundValue");
const comboValue = $("comboValue");
const ruleIndex = $("ruleIndex");
const ruleTag = $("ruleTag");
const ruleTitle = $("ruleTitle");
const ruleCopy = $("ruleCopy");
const ruleProgress = $("ruleProgress");
const ruleStrip = $("ruleStrip");
const toast = $("toast");
const overlay = $("gameOverlay");
const overlayTitle = $("overlayTitle");
const overlayCopy = $("overlayCopy");
const startButton = $("startButton");
const pauseButton = $("pauseButton");
const dashMeter = $("dashMeter");
const dashStatus = $("dashStatus");
const soundButton = $("soundButton");
const touchDash = $("touchDash");
const touchDirectionButtons = [...document.querySelectorAll("[data-key]")];

const RUN_DURATION = 60;
const RULE_DURATION = 8;
const DASH_COOLDOWN = 1.1;

function readStorage(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* Private browsing or file previews may disable storage. */ }
}

const audio = {
  enabled: readStorage("ruleshift:sound", "on") !== "off",
  context: null,
};

function ensureAudio() {
  if (!audio.enabled) return null;
  if (!audio.context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audio.context = new AudioContext();
  }
  if (audio.context.state === "suspended") audio.context.resume();
  return audio.context;
}

function tone(frequency, duration = .08, type = "sine", volume = .035, delay = 0) {
  const audioContext = ensureAudio();
  if (!audioContext) return;
  const startAt = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + .008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + .02);
}

function playSound(name) {
  if (!audio.enabled) return;
  if (name === "start") {
    tone(220, .08, "square", .025);
    tone(440, .12, "square", .025, .08);
  } else if (name === "shift") {
    tone(180, .1, "sawtooth", .025);
    tone(320, .14, "sawtooth", .025, .07);
  } else if (name === "collect") {
    tone(620, .07, "sine", .035);
  } else if (name === "gold") {
    tone(740, .08, "sine", .04);
    tone(980, .1, "sine", .035, .055);
  } else if (name === "dash") {
    tone(120, .08, "sawtooth", .028);
  } else if (name === "hit") {
    tone(82, .18, "square", .045);
  } else if (name === "finish") {
    tone(330, .12, "triangle", .03);
    tone(440, .16, "triangle", .03, .1);
    tone(660, .22, "triangle", .03, .2);
  }
}

const RULES = [
  { id: "mirror", category: "movement", tag: "INPUT / FLIP", title: "MIRROR MODE", copy: "왼쪽과 오른쪽의 감각이 뒤집힌다.", color: "#d7ff52", accent: "#192514" },
  { id: "overdrive", category: "movement", tag: "SPEED / UP", title: "OVERDRIVE", copy: "당신도, 드론도 더 빠르게 움직인다.", color: "#ff7653", accent: "#2a1717" },
  { id: "gold", category: "score", tag: "SCORE / MULTI", title: "GOLD RUSH", copy: "금빛 오브의 점수가 세 배로 뛴다.", color: "#ffd765", accent: "#2b2412" },
  { id: "orbit", category: "enemy", tag: "DRONE / ORBIT", title: "ORBITAL DRIFT", copy: "드론이 중앙을 중심으로 선회한다.", color: "#77e5ff", accent: "#11262d" },
  { id: "red", category: "arena", tag: "ARENA / DANGER", title: "RED ZONE", copy: "바깥 테두리가 위험 구역이 된다.", color: "#ff7653", accent: "#2a1717" },
  { id: "quiet", category: "arena", tag: "SIGNAL / LOW", title: "LOW SIGNAL", copy: "빛이 줄어든다. 가까운 것만 믿어라.", color: "#bca9ff", accent: "#1d1831" },
  { id: "bloom", category: "score", tag: "ORB / BLOOM", title: "BLOOM FIELD", copy: "오브를 먹을 때마다 작은 오브가 피어난다.", color: "#77e5ff", accent: "#11262d" },
  { id: "gravity", category: "physics", tag: "MOTION / HEAVY", title: "HEAVY HAND", copy: "관성이 커진다. 멈추는 것도 기술이다.", color: "#d7ff52", accent: "#192514" },
];

const state = {
  mode: "ready",
  score: 0,
  bestScore: Number.parseInt(readStorage("ruleshift:best", "0"), 10) || 0,
  time: RUN_DURATION,
  elapsed: 0,
  round: 0,
  combo: 0,
  rule: null,
  deck: [],
  recentCategories: [],
  nextRuleAt: 0,
  flash: 0,
  shake: 0,
  toastTimer: 0,
  dashCooldown: 0,
  player: { x: W / 2, y: H / 2, r: 14, vx: 0, vy: 0, invuln: 0, trail: [] },
  orbs: [],
  enemies: [],
  particles: [],
  floatingTexts: [],
  last: performance.now(),
};

const keys = new Set();

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function randomPoint(padding = 58) {
  return { x: rand(arena.x + padding, arena.x + arena.w - padding), y: rand(arena.y + padding, arena.y + arena.h - padding) };
}

function createOrb() {
  const point = randomPoint(48);
  const gold = Math.random() < 0.2;
  return { x: point.x, y: point.y, r: gold ? 9 : 7, gold, pulse: Math.random() * Math.PI * 2 };
}

function createEnemy(index) {
  const side = index % 4;
  const point = side === 0 ? { x: arena.x + 26, y: rand(arena.y + 40, arena.y + arena.h - 40) }
    : side === 1 ? { x: arena.x + arena.w - 26, y: rand(arena.y + 40, arena.y + arena.h - 40) }
      : side === 2 ? { x: rand(arena.x + 40, arena.x + arena.w - 40), y: arena.y + 26 }
        : { x: rand(arena.x + 40, arena.x + arena.w - 40), y: arena.y + arena.h - 26 };
  return { x: point.x, y: point.y, r: 11, vx: rand(-1, 1), vy: rand(-1, 1), phase: Math.random() * Math.PI * 2, seed: index };
}

function resetWorld() {
  state.score = 0;
  state.time = RUN_DURATION;
  state.elapsed = 0;
  state.round = 0;
  state.combo = 0;
  state.rule = null;
  state.deck = [];
  state.recentCategories = [];
  state.nextRuleAt = 0;
  state.flash = 0;
  state.shake = 0;
  state.toastTimer = 0;
  state.dashCooldown = 0;
  state.player = { x: W / 2, y: H / 2, r: 14, vx: 0, vy: 0, invuln: 0, trail: [] };
  state.orbs = Array.from({ length: 11 }, createOrb);
  state.enemies = Array.from({ length: 5 }, (_, index) => createEnemy(index));
  state.particles = [];
  state.floatingTexts = [];
  updateHud();
}

function drawRule(rule) {
  state.rule = rule;
  state.round += 1;
  state.nextRuleAt = state.elapsed + RULE_DURATION;
  state.flash = 1;
  state.shake = 4;
  state.recentCategories.push(rule.category);
  state.recentCategories = state.recentCategories.slice(-3);
  ruleIndex.textContent = `RULE ${String(state.round).padStart(2, "0")}`;
  ruleTag.textContent = rule.tag;
  ruleTitle.textContent = rule.title;
  ruleCopy.textContent = rule.copy;
  ruleStrip.style.borderColor = `${rule.color}66`;
  ruleStrip.style.background = `linear-gradient(90deg, ${rule.accent}, rgba(215,255,82,.025))`;
  showToast(`${rule.title}  /  ${rule.copy}`);
  burst(state.player.x, state.player.y, rule.color, 22);
  playSound("shift");
}

function nextRule() {
  if (state.deck.length === 0) state.deck = shuffle(RULES);
  let choiceIndex = state.deck.findIndex((rule) => !state.recentCategories.includes(rule.category));
  if (choiceIndex < 0) choiceIndex = 0;
  const [choice] = state.deck.splice(choiceIndex, 1);
  drawRule(choice);
}

function updateHud() {
  scoreValue.textContent = String(Math.max(0, Math.floor(state.score))).padStart(6, "0");
  timeValue.textContent = state.time.toFixed(1).padStart(4, "0");
  roundValue.textContent = String(state.round).padStart(2, "0");
  comboValue.textContent = `x${state.combo}`;
  if (state.rule) {
    const secondsLeft = Math.max(0, state.nextRuleAt - state.elapsed);
    const remaining = clamp(secondsLeft / RULE_DURATION, 0, 1);
    ruleProgress.textContent = String(Math.ceil(secondsLeft));
    ruleProgress.parentElement.style.background = `conic-gradient(${state.rule.color} ${remaining * 360}deg, transparent 0deg)`;
  }
  const dashReadyRatio = 1 - clamp(state.dashCooldown / DASH_COOLDOWN, 0, 1);
  dashMeter.style.transform = `scaleX(${dashReadyRatio})`;
  const dashReady = state.dashCooldown <= .01;
  dashStatus.textContent = dashReady ? "DASH READY" : `DASH ${state.dashCooldown.toFixed(1)}s`;
  dashStatus.parentElement.classList.toggle("is-ready", dashReady);
  touchDash.disabled = state.mode !== "playing" || !dashReady;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = 2.3;
}

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.gameState = mode;
  canvas.dataset.gameState = mode;
  const isReady = mode === "ready";
  const isPaused = mode === "paused";
  overlay.classList.toggle("is-hidden", mode === "playing");
  pauseButton.disabled = mode !== "playing" && !isPaused;
  touchDirectionButtons.forEach((button) => { button.disabled = mode !== "playing"; });
  pauseButton.innerHTML = isPaused ? "RESUME <span>▶</span>" : "PAUSE <span>Ⅱ</span>";
  touchDash.disabled = mode !== "playing" || state.dashCooldown > 0;
  if (isReady) {
    overlayTitle.textContent = "RULESHIFT";
    overlayCopy.innerHTML = "룰은 예고 없이 바뀐다.<br />당신은 얼마나 빨리 적응할 수 있나?";
    startButton.innerHTML = "<span>START RUN</span><b>↗</b>";
  } else if (isPaused) {
    overlayTitle.textContent = "HOLD THE LINE";
    overlayCopy.innerHTML = "잠깐 멈췄다.<br />다시 움직이면 룰은 계속된다.";
    startButton.innerHTML = "<span>RESUME RUN</span><b>↗</b>";
  } else if (mode === "over") {
    const finalScore = Math.floor(state.score);
    const rank = finalScore >= 1800 ? "S" : finalScore >= 1200 ? "A" : finalScore >= 700 ? "B" : finalScore >= 300 ? "C" : "D";
    overlayTitle.textContent = `SHIFT RANK ${rank}`;
    overlayCopy.innerHTML = `SCORE <b class="overlay-score">${String(finalScore).padStart(6, "0")}</b> · BEST ${String(state.bestScore).padStart(6, "0")}<br />다음 판에서는 더 높은 랭크에 도전하라.`;
    startButton.innerHTML = "<span>RUN IT BACK</span><b>↗</b>";
  }
  updateHud();
}

function beginGame() {
  ensureAudio();
  resetWorld();
  setMode("playing");
  playSound("start");
  nextRule();
  canvas.focus();
  state.last = performance.now();
}

function togglePause() {
  if (state.mode === "playing") setMode("paused");
  else if (state.mode === "paused") {
    setMode("playing");
    state.last = performance.now();
  }
}

function dash() {
  if (state.mode !== "playing" || state.dashCooldown > 0) return;
  let input = getInput();
  if (input.x === 0 && input.y === 0) {
    const velocity = Math.hypot(state.player.vx, state.player.vy);
    if (velocity < 12) return;
    input = { x: state.player.vx / velocity, y: state.player.vy / velocity };
  }
  state.player.vx += input.x * 270;
  state.player.vy += input.y * 270;
  state.player.invuln = Math.max(state.player.invuln, .35);
  state.dashCooldown = DASH_COOLDOWN;
  burst(state.player.x, state.player.y, "#d7ff52", 10);
  addFloatingText(state.player.x, state.player.y - 22, "DASH", "#d7ff52");
  playSound("dash");
}

function getInput() {
  let x = 0;
  let y = 0;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (keys.has("w") || keys.has("arrowup")) y -= 1;
  if (keys.has("s") || keys.has("arrowdown")) y += 1;
  if (state.rule?.id === "mirror") x *= -1;
  const magnitude = Math.hypot(x, y) || 1;
  return { x: x / magnitude, y: y / magnitude };
}

function hitPlayer() {
  if (state.player.invuln > 0) return;
  state.player.invuln = 1.05;
  state.score = Math.max(0, state.score - 80);
  state.combo = 0;
  state.shake = 12;
  showToast("SIGNAL LOST  /  -80");
  burst(state.player.x, state.player.y, "#ff7653", 18);
  addFloatingText(state.player.x, state.player.y - 24, "−80", "#ff7653");
  playSound("hit");
}

function collectOrb(orb) {
  const base = orb.gold ? 100 : 40;
  const multiplier = state.rule?.id === "gold" ? 3 : 1;
  const gained = base * multiplier + state.combo * 3;
  state.score += gained;
  state.combo = Math.min(99, state.combo + 1);
  burst(orb.x, orb.y, orb.gold ? "#ffd765" : "#77e5ff", orb.gold ? 12 : 7);
  addFloatingText(orb.x, orb.y - 15, `+${gained}`, orb.gold ? "#ffd765" : "#77e5ff");
  playSound(orb.gold ? "gold" : "collect");
  if (state.rule?.id === "bloom") {
    state.orbs.push(createOrb());
  }
  Object.assign(orb, createOrb());
}

function addFloatingText(x, y, text, color) {
  state.floatingTexts.push({ x, y, text, color, life: .85, maxLife: .85 });
}

function finishGame() {
  if (state.mode !== "playing") return;
  const finalScore = Math.floor(state.score);
  if (finalScore > state.bestScore) {
    state.bestScore = finalScore;
    writeStorage("ruleshift:best", String(finalScore));
  }
  playSound("finish");
  setMode("over");
}

function burst(x, y, color, amount) {
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(35, 150);
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(.35, .8), maxLife: .8, size: rand(1, 4), color });
  }
}

function update(dt) {
  state.elapsed += dt;
  state.time = Math.max(0, RUN_DURATION - state.elapsed);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.player.invuln = Math.max(0, state.player.invuln - dt);
  state.flash = Math.max(0, state.flash - dt * 2.5);
  state.shake = Math.max(0, state.shake - dt * 18);
  state.toastTimer -= dt;
  if (state.toastTimer <= 0) toast.classList.remove("is-visible");

  if (state.elapsed >= state.nextRuleAt) nextRule();

  const input = getInput();
  const speed = 220 * (state.rule?.id === "overdrive" ? 1.35 : 1) * (state.rule?.id === "gravity" ? .62 : 1);
  const acceleration = 10;
  state.player.vx = lerp(state.player.vx, input.x * speed, clamp(acceleration * dt, 0, 1));
  state.player.vy = lerp(state.player.vy, input.y * speed, clamp(acceleration * dt, 0, 1));
  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;
  state.player.x = clamp(state.player.x, arena.x + state.player.r, arena.x + arena.w - state.player.r);
  state.player.y = clamp(state.player.y, arena.y + state.player.r, arena.y + arena.h - state.player.r);
  state.player.trail.unshift({ x: state.player.x, y: state.player.y, life: 1 });
  state.player.trail = state.player.trail.slice(0, 11).map((point) => ({ ...point, life: point.life - dt * 2.5 })).filter((point) => point.life > 0);

  for (const orb of state.orbs) {
    orb.pulse += dt * (orb.gold ? 4 : 2.5);
    if (distance(state.player, orb) < state.player.r + orb.r + 2) collectOrb(orb);
  }

  for (const enemy of state.enemies) {
    const angleToPlayer = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
    const enemySpeed = 42 * (state.rule?.id === "overdrive" ? 1.3 : 1);
    if (state.rule?.id === "orbit") {
      enemy.phase += dt * .9;
      const orbitAngle = Math.atan2(enemy.y - H / 2, enemy.x - W / 2) + dt * (.5 + enemy.seed * .04);
      const desiredX = W / 2 + Math.cos(orbitAngle) * (190 + enemy.seed * 18);
      const desiredY = H / 2 + Math.sin(orbitAngle) * (130 + enemy.seed * 13);
      enemy.vx = lerp(enemy.vx, (desiredX - enemy.x) * .7, dt);
      enemy.vy = lerp(enemy.vy, (desiredY - enemy.y) * .7, dt);
    } else {
      enemy.vx = lerp(enemy.vx, Math.cos(angleToPlayer) * enemySpeed, dt * .45);
      enemy.vy = lerp(enemy.vy, Math.sin(angleToPlayer) * enemySpeed, dt * .45);
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.x = clamp(enemy.x, arena.x + enemy.r, arena.x + arena.w - enemy.r);
    enemy.y = clamp(enemy.y, arena.y + enemy.r, arena.y + arena.h - enemy.r);
    if (distance(state.player, enemy) < state.player.r + enemy.r + 2) hitPlayer();
  }

  if (state.rule?.id === "red") {
    const edgeDistance = Math.min(state.player.x - arena.x, arena.x + arena.w - state.player.x, state.player.y - arena.y, arena.y + arena.h - state.player.y);
    if (edgeDistance < 34) hitPlayer();
  }

  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= .96;
    particle.vy *= .96;
    particle.life -= dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const label of state.floatingTexts) {
    label.y -= dt * 30;
    label.life -= dt;
  }
  state.floatingTexts = state.floatingTexts.filter((label) => label.life > 0);
  state.score += dt * 2;
  updateHud();
  if (state.time <= 0) finishGame();
}

function drawBackground() {
  ctx.fillStyle = "#0c1019";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = .15;
  ctx.strokeStyle = state.rule?.color || "#d7ff52";
  ctx.lineWidth = 1;
  for (let x = arena.x; x <= arena.x + arena.w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, arena.y); ctx.lineTo(x, arena.y + arena.h); ctx.stroke();
  }
  for (let y = arena.y; y <= arena.y + arena.h; y += 40) {
    ctx.beginPath(); ctx.moveTo(arena.x, y); ctx.lineTo(arena.x + arena.w, y); ctx.stroke();
  }
  ctx.restore();
  const glow = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 500);
  glow.addColorStop(0, `${state.rule?.color || "#d7ff52"}17`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawArena() {
  ctx.save();
  ctx.strokeStyle = `${state.rule?.color || "#d7ff52"}99`;
  ctx.lineWidth = 2;
  ctx.strokeRect(arena.x, arena.y, arena.w, arena.h);
  ctx.strokeStyle = "rgba(241,240,232,.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(arena.x + 13, arena.y + 13, arena.w - 26, arena.h - 26);
  if (state.rule?.id === "red") {
    ctx.strokeStyle = "#ff7653";
    ctx.lineWidth = 20;
    ctx.globalAlpha = .24;
    ctx.strokeRect(arena.x + 10, arena.y + 10, arena.w - 20, arena.h - 20);
  }
  if (state.rule?.id === "quiet") {
    const vignette = ctx.createRadialGradient(state.player.x, state.player.y, 75, state.player.x, state.player.y, 260);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, "rgba(4,5,8,.82)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawOrb(orb) {
  const pulse = Math.sin(orb.pulse) * 1.5;
  const color = orb.gold ? "#ffd765" : "#77e5ff";
  ctx.save();
  ctx.translate(orb.x, orb.y);
  ctx.rotate(Math.PI / 4);
  ctx.shadowBlur = orb.gold ? 18 : 12;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = .9;
  ctx.fillRect(-orb.r / 1.7 - pulse / 4, -orb.r / 1.7 - pulse / 4, orb.r * 1.45 + pulse, orb.r * 1.45 + pulse);
  ctx.globalAlpha = .5;
  ctx.fillStyle = "#f1f0e8";
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();
}

function drawEnemy(enemy) {
  const color = state.rule?.id === "overdrive" ? "#ff4f32" : "#ff7653";
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
  ctx.shadowBlur = state.rule?.id === "overdrive" ? 20 : 13;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = .92;
  ctx.beginPath();
  ctx.moveTo(enemy.r * 1.35, 0);
  ctx.lineTo(-enemy.r * .85, enemy.r * .9);
  ctx.lineTo(-enemy.r * .4, 0);
  ctx.lineTo(-enemy.r * .85, -enemy.r * .9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#0c1019";
  ctx.beginPath(); ctx.arc(2, 0, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const player = state.player;
  ctx.save();
  for (let index = player.trail.length - 1; index >= 0; index -= 1) {
    const point = player.trail[index];
    ctx.globalAlpha = point.life * .12;
    ctx.fillStyle = "#d7ff52";
    ctx.beginPath(); ctx.arc(point.x, point.y, player.r * (point.life + .2), 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(player.x, player.y);
  ctx.globalAlpha = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0 ? .35 : 1;
  ctx.shadowBlur = 22;
  ctx.shadowColor = "#d7ff52";
  ctx.fillStyle = "#d7ff52";
  ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#0c1019";
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(241,240,232,.8)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, player.r + 6 + Math.sin(state.elapsed * 6) * 2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    ctx.restore();
  }
}

function drawFloatingTexts() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "500 13px 'DM Mono', monospace";
  for (const label of state.floatingTexts) {
    ctx.globalAlpha = clamp(label.life / label.maxLife, 0, 1);
    ctx.fillStyle = label.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = label.color;
    ctx.fillText(label.text, label.x, label.y);
  }
  ctx.restore();
}

function drawCanvasLabels() {
  ctx.save();
  ctx.fillStyle = "rgba(241,240,232,.52)";
  ctx.font = "10px 'DM Mono', monospace";
  if (state.mode === "playing" && state.nextRuleAt - state.elapsed < 2) {
    ctx.fillStyle = state.rule?.color || "#d7ff52";
    ctx.fillText("SHIFT IMMINENT", W / 2 - 44, arena.y + arena.h - 17);
  }
  ctx.restore();
}

function draw(now) {
  ctx.save();
  if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  drawBackground();
  drawArena();
  for (const orb of state.orbs) drawOrb(orb);
  for (const enemy of state.enemies) drawEnemy(enemy);
  drawPlayer();
  drawParticles();
  drawFloatingTexts();
  drawCanvasLabels();
  if (state.flash > 0) {
    ctx.fillStyle = `${state.rule?.color || "#d7ff52"}${Math.floor(state.flash * 28).toString(16).padStart(2, "0")}`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.mode === "paused") {
    ctx.fillStyle = "rgba(7,9,13,.5)";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  void now;
}

function loop(now) {
  const dt = Math.min(.04, (now - state.last) / 1000);
  state.last = now;
  if (state.mode === "playing") update(dt);
  draw(now);
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if ((key === "enter" || key === "return") && (state.mode === "ready" || state.mode === "over")) { beginGame(); return; }
  if (key === "p" || key === "escape") { togglePause(); return; }
  if (key === " ") { dash(); return; }
  keys.add(key);
});

window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  if (state.mode === "playing") setMode("paused");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "playing") {
    keys.clear();
    setMode("paused");
  }
});
startButton.addEventListener("click", () => {
  if (state.mode === "paused") togglePause();
  else beginGame();
});
pauseButton.addEventListener("click", togglePause);
canvas.addEventListener("click", () => canvas.focus());
soundButton.addEventListener("click", () => {
  audio.enabled = !audio.enabled;
  writeStorage("ruleshift:sound", audio.enabled ? "on" : "off");
  soundButton.setAttribute("aria-pressed", String(audio.enabled));
  soundButton.innerHTML = `${audio.enabled ? "SOUND ON" : "SOUND OFF"} <span>${audio.enabled ? "♪" : "×"}</span>`;
  if (audio.enabled) {
    ensureAudio();
    tone(520, .08, "sine", .03);
  }
});

for (const button of touchDirectionButtons) {
  const key = button.dataset.key;
  const release = () => {
    keys.delete(key);
    button.classList.remove("is-active");
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    try { button.setPointerCapture?.(event.pointerId); }
    catch { /* Synthetic and assistive pointer events may not own a capture target. */ }
    keys.add(key);
    button.classList.add("is-active");
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

touchDash.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dash();
});

resetWorld();
soundButton.setAttribute("aria-pressed", String(audio.enabled));
soundButton.innerHTML = `${audio.enabled ? "SOUND ON" : "SOUND OFF"} <span>${audio.enabled ? "♪" : "×"}</span>`;
setMode("ready");
requestAnimationFrame(loop);
