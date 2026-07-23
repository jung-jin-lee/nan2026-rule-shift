const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const arena = { x: 34, y: 30, w: W - 68, h: H - 60 };

const $ = (id) => document.getElementById(id);
const scoreValue = $("scoreValue");
const timeValue = $("timeValue");
const stageValue = $("stageValue");
const stageMeta = $("stageMeta");
const comboValue = $("comboValue");
const ruleIndex = $("ruleIndex");
const ruleTag = $("ruleTag");
const ruleTitle = $("ruleTitle");
const ruleCopy = $("ruleCopy");
const ruleProgress = $("ruleProgress");
const ruleStrip = $("ruleStrip");
const toast = $("toast");
const stageBanner = $("stageBanner");
const stageBannerKicker = $("stageBannerKicker");
const stageBannerTitle = $("stageBannerTitle");
const stageBannerCopy = $("stageBannerCopy");
const stageSelector = $("stageSelector");
const stageSelectStatus = $("stageSelectStatus");
const stageOptions = [...document.querySelectorAll("[data-stage-index]")];
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
const MAX_SIMULATION_STEP = .04;
const RUN_DURATION_EPSILON = 1e-7;
const DASH_COOLDOWN = 1.1;
const BLOOM_ORB_BONUS_CAP = 3;
const PROGRESS_STORAGE_KEY = "ruleshift:stage-progress";
const BEST_STORAGE_KEY = "ruleshift:best";
const PROGRESS_STORAGE_LOCK = "ruleshift:progress-storage";
const MAX_STORED_SCORE = 9_999_999;
// Kept only to validate progress written before the target-score rebalance.
const LEGACY_UNLOCK_TARGETS = [900, 1400, 2000, 2800];

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
  } else if (name === "targetLocked") {
    tone(660, .09, "triangle", .04);
    tone(880, .14, "triangle", .04, .07);
  } else if (name === "targetLost") {
    tone(190, .13, "sawtooth", .035);
    tone(130, .16, "sawtooth", .025, .06);
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

const STAGES = [
  { name: "SYNC", cue: "DIRECT PURSUIT", scoreMultiplier: 1, enemyCount: 4, enemySpeed: .82, hitPenalty: 60, orbCount: 12, targetScore: 2200, color: "#77e5ff", ai: { level: 1, lead: 0, formation: 0, separation: .18, turning: 2.5, orbitBias: .34, roles: ["hunter"] } },
  { name: "PRESSURE", cue: "PATH PREDICTION", scoreMultiplier: 1.25, enemyCount: 5, enemySpeed: 1, hitPenalty: 80, orbCount: 10, targetScore: 3800, color: "#d7ff52", ai: { level: 2, lead: .42, formation: .16, separation: .32, turning: 3.1, orbitBias: .42, roles: ["hunter", "hunter", "interceptor"] } },
  { name: "OVERLOAD", cue: "PINCER FORMATION", scoreMultiplier: 1.55, enemyCount: 6, enemySpeed: 1.16, hitPenalty: 105, orbCount: 8, targetScore: 6200, color: "#ffb36b", ai: { level: 3, lead: .48, formation: .76, separation: .58, turning: 3.8, orbitBias: .5, roles: ["hunter", "interceptor", "flanker"] } },
  { name: "BREAKPOINT", cue: "ADAPTIVE HUNT", scoreMultiplier: 2, enemyCount: 7, enemySpeed: 1.32, hitPenalty: 130, orbCount: 6, targetScore: 9000, color: "#ff7653", ai: { level: 4, lead: .52, formation: .95, separation: .76, turning: 4.35, orbitBias: .58, roles: ["hunter", "interceptor", "flanker", "warden", "cutoff"] } },
];

function storedScore(value) {
  return Number.isSafeInteger(value) && value >= 0 ? clamp(value, 0, MAX_STORED_SCORE) : 0;
}

function readStoredScore(key) {
  const raw = readStorage(key, "");
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) return 0;
  return storedScore(Number(raw));
}

function readProgress() {
  const fallback = { unlockedStage: 0, stageBest: STAGES.map(() => 0) };
  const raw = readStorage(PROGRESS_STORAGE_KEY, "");
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const requestedUnlockedStage = Number.isSafeInteger(parsed.unlockedStage)
      ? clamp(parsed.unlockedStage, 0, STAGES.length - 1)
      : 0;
    const stageBest = Array.isArray(parsed.stageBest)
      ? STAGES.map((_, index) => storedScore(parsed.stageBest[index]))
      : fallback.stageBest;
    let verifiedCurrentUnlock = 0;
    while (verifiedCurrentUnlock < STAGES.length - 1 && stageBest[verifiedCurrentUnlock] >= STAGES[verifiedCurrentUnlock].targetScore) {
      verifiedCurrentUnlock += 1;
    }
    let verifiedLegacyUnlock = 0;
    while (verifiedLegacyUnlock < requestedUnlockedStage && stageBest[verifiedLegacyUnlock] >= LEGACY_UNLOCK_TARGETS[verifiedLegacyUnlock]) {
      verifiedLegacyUnlock += 1;
    }
    // Preserve old unlocks only when their old score chain proves them; a bare/zero forged index is rejected.
    return { unlockedStage: Math.max(verifiedCurrentUnlock, verifiedLegacyUnlock), stageBest };
  } catch {
    return fallback;
  }
}

function writeProgress(progress) {
  writeStorage(PROGRESS_STORAGE_KEY, JSON.stringify({
    unlockedStage: clamp(progress.unlockedStage, 0, STAGES.length - 1),
    stageBest: STAGES.map((_, index) => storedScore(progress.stageBest[index])),
  }));
}

function mergeProgress(...progresses) {
  return {
    unlockedStage: clamp(Math.max(
      0,
      ...progresses.map((item) => Number.isSafeInteger(item?.unlockedStage) ? item.unlockedStage : 0),
    ), 0, STAGES.length - 1),
    stageBest: STAGES.map((_, index) => Math.max(
      0,
      ...progresses.map((item) => storedScore(item?.stageBest?.[index])),
    )),
  };
}

function applyFinishToProgress(progress, completedStageIndex, finalScore, cleared) {
  const nextProgress = mergeProgress(progress);
  nextProgress.stageBest[completedStageIndex] = Math.max(
    nextProgress.stageBest[completedStageIndex],
    storedScore(finalScore),
  );
  let newlyUnlocked = null;
  if (cleared && completedStageIndex < STAGES.length - 1 && nextProgress.unlockedStage < completedStageIndex + 1) {
    nextProgress.unlockedStage = completedStageIndex + 1;
    newlyUnlocked = completedStageIndex + 1;
  }
  return { progress: nextProgress, newlyUnlocked };
}

function commitFinishSnapshot(snapshot) {
  const latestProgress = readProgress();
  const latestBestScore = readStoredScore(BEST_STORAGE_KEY);
  const mergedProgress = mergeProgress(latestProgress, snapshot.progress);
  const applied = applyFinishToProgress(
    mergedProgress,
    snapshot.completedStageIndex,
    snapshot.finalScore,
    snapshot.cleared,
  );
  const bestScore = Math.max(latestBestScore, snapshot.bestScore, storedScore(snapshot.finalScore));
  writeProgress(applied.progress);
  writeStorage(BEST_STORAGE_KEY, String(bestScore));
  return { progress: applied.progress, bestScore, newlyUnlocked: applied.newlyUnlocked };
}

function commitFinishSnapshotSafely(snapshot) {
  try { return commitFinishSnapshot(snapshot); }
  catch {
    const applied = applyFinishToProgress(
      snapshot.progress,
      snapshot.completedStageIndex,
      snapshot.finalScore,
      snapshot.cleared,
    );
    return {
      progress: applied.progress,
      bestScore: Math.max(snapshot.bestScore, storedScore(snapshot.finalScore)),
      newlyUnlocked: applied.newlyUnlocked,
    };
  }
}

function persistFinishSnapshot(snapshot) {
  const fallback = () => commitFinishSnapshotSafely(snapshot);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.locks?.request === "function") {
      return Promise.resolve(navigator.locks.request(
        PROGRESS_STORAGE_LOCK,
        { mode: "exclusive" },
        () => commitFinishSnapshotSafely(snapshot),
      )).catch(fallback);
    }
  } catch { /* Web Locks may be unavailable in restricted browser contexts. */ }
  return Promise.resolve(fallback());
}

const progress = readProgress();

const state = {
  mode: "ready",
  score: 0,
  bestScore: readStoredScore(BEST_STORAGE_KEY),
  time: RUN_DURATION,
  elapsed: 0,
  round: 0,
  selectedStageIndex: progress.unlockedStage,
  stageIndex: progress.unlockedStage,
  stage: STAGES[progress.unlockedStage],
  progress,
  result: null,
  stageBannerTimer: 0,
  combo: 0,
  rule: null,
  deck: [],
  recentCategories: [],
  nextRuleAt: 0,
  flash: 0,
  shake: 0,
  toastTimer: 0,
  targetLocked: false,
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

function createEnemy(index, spawnDelay = 0) {
  const side = index % 4;
  const point = side === 0 ? { x: arena.x + 26, y: rand(arena.y + 40, arena.y + arena.h - 40) }
    : side === 1 ? { x: arena.x + arena.w - 26, y: rand(arena.y + 40, arena.y + arena.h - 40) }
      : side === 2 ? { x: rand(arena.x + 40, arena.x + arena.w - 40), y: arena.y + 26 }
        : { x: rand(arena.x + 40, arena.x + arena.w - 40), y: arena.y + arena.h - 26 };
  const roles = state.stage.ai.roles;
  return { x: point.x, y: point.y, r: 11, vx: rand(-1, 1), vy: rand(-1, 1), phase: Math.random() * Math.PI * 2, seed: index, role: roles[index % roles.length], spawnDelay };
}

function stageMultiplierLabel() { return `×${state.stage.scoreMultiplier.toFixed(2)}`; }

function stageNumber(index = state.stageIndex) {
  return String(index + 1).padStart(2, "0");
}

function stageTargetLabel(stage = state.stage) {
  return String(stage.targetScore).padStart(4, "0");
}

function isStageUnlocked(index) {
  return Number.isInteger(index) && index >= 0 && index <= state.progress.unlockedStage;
}

function setRunStage(index) {
  state.stageIndex = index;
  state.stage = STAGES[index];
}

function showStageBanner() {
  stageBannerKicker.textContent = `STAGE ${stageNumber()} / 04`;
  stageBannerTitle.textContent = state.stage.name;
  stageBannerCopy.textContent = `${state.stage.cue} · TARGET ${stageTargetLabel()} · 60 SEC`;
  stageBanner.style.setProperty("--stage-color", state.stage.color);
  stageBanner.classList.add("is-visible");
  state.stageBannerTimer = 1.7;
}

function renderStageSelector(announce = false) {
  for (const option of stageOptions) {
    const index = Number.parseInt(option.dataset.stageIndex, 10);
    const stage = STAGES[index];
    const unlocked = isStageUnlocked(index);
    const selected = index === state.selectedStageIndex;
    // A later unlocked stage proves this card cleared under its valid legacy/current target.
    const cleared = index < state.progress.unlockedStage || state.progress.stageBest[index] >= stage.targetScore;
    option.disabled = !unlocked;
    option.setAttribute("aria-disabled", String(!unlocked));
    option.setAttribute("aria-pressed", String(unlocked && selected));
    option.classList.toggle("is-selected", unlocked && selected);
    option.classList.toggle("is-locked", !unlocked);
    option.classList.toggle("is-cleared", cleared);
    option.querySelector("[data-stage-target]").textContent = stageTargetLabel(stage);
    option.querySelector("[data-stage-best]").textContent = String(state.progress.stageBest[index]).padStart(4, "0");
    option.querySelector("[data-stage-status]").textContent = !unlocked ? "LOCKED" : cleared ? "CLEAR" : "READY";
    option.setAttribute("aria-label", `STAGE ${stageNumber(index)} ${stage.name}, ${!unlocked ? "locked" : `target ${stage.targetScore}, best ${state.progress.stageBest[index]}`}`);
  }
  if (announce) {
    const selected = STAGES[state.selectedStageIndex];
    stageSelectStatus.textContent = `STAGE ${stageNumber(state.selectedStageIndex)} ${selected.name} selected. Target score ${selected.targetScore}.`;
  }
}

function selectStage(index, announce = true) {
  if (state.mode === "playing" || state.mode === "paused" || !isStageUnlocked(index)) return false;
  state.selectedStageIndex = index;
  setRunStage(index);
  renderStageSelector(announce);
  updateHud();
  renderOverlay();
  return true;
}

function resetWorld() {
  state.score = 0;
  state.time = RUN_DURATION;
  state.elapsed = 0;
  state.round = 0;
  state.stageBannerTimer = 0;
  state.combo = 0;
  state.rule = null;
  state.deck = [];
  state.recentCategories = [];
  state.nextRuleAt = 0;
  state.flash = 0;
  state.shake = 0;
  state.toastTimer = 0;
  state.targetLocked = false;
  state.dashCooldown = 0;
  state.player = { x: W / 2, y: H / 2, r: 14, vx: 0, vy: 0, invuln: 0, trail: [] };
  state.orbs = Array.from({ length: state.stage.orbCount }, createOrb);
  state.enemies = Array.from({ length: state.stage.enemyCount }, (_, index) => createEnemy(index));
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
  stageValue.textContent = stageNumber();
  stageMeta.textContent = `${state.stage.name} · ${stageMultiplierLabel()} · TGT ${stageTargetLabel()}`;
  comboValue.textContent = `x${state.combo}`;
  const targetProgress = clamp(state.score / state.stage.targetScore, 0, 1);
  scoreValue.parentElement.style.setProperty("--target-progress", String(targetProgress));
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

function renderOverlay() {
  const selected = STAGES[state.selectedStageIndex];
  const selectedBest = String(state.progress.stageBest[state.selectedStageIndex]).padStart(4, "0");
  const selectedStageDetail = `${selected.cue}<br />TARGET <b class="overlay-score">${stageTargetLabel(selected)}</b> · BEST ${selectedBest} · SCORE ${selected.scoreMultiplier.toFixed(2)}×`;
  if (state.mode === "ready") {
    overlayTitle.textContent = `STAGE ${stageNumber(state.selectedStageIndex)} · ${selected.name}`;
    overlayCopy.innerHTML = selectedStageDetail;
    startButton.innerHTML = `<span>START STAGE ${stageNumber(state.selectedStageIndex)}</span><b>↗</b>`;
  } else if (state.mode === "paused") {
    overlayTitle.textContent = `STAGE ${stageNumber()} · PAUSED`;
    overlayCopy.innerHTML = `${selectedStageDetail}<br />RUN PAUSED`;
    startButton.innerHTML = "<span>RESUME RUN</span><b>↗</b>";
  } else if (state.mode === "over" && state.result) {
    const resultStage = STAGES[state.result.stageIndex];
    const finalScore = state.result.finalScore;
    if (!state.result.cleared) {
      const missing = Math.max(0, resultStage.targetScore - finalScore);
      overlayTitle.textContent = `STAGE ${stageNumber(state.result.stageIndex)} · FAIL`;
      overlayCopy.innerHTML = `SCORE <b class="overlay-score">${String(finalScore).padStart(6, "0")}</b> / TARGET ${stageTargetLabel(resultStage)} · ${String(missing).padStart(4, "0")} LEFT<br />${selectedStageDetail}`;
    } else if (state.result.stageIndex === STAGES.length - 1) {
      overlayTitle.textContent = "ALL STAGES CLEAR";
      overlayCopy.innerHTML = `STAGE 04 CLEAR · SCORE <b class="overlay-score">${String(finalScore).padStart(6, "0")}</b><br />${selectedStageDetail}`;
    } else {
      const nextStage = STAGES[state.selectedStageIndex];
      overlayTitle.textContent = `STAGE ${stageNumber(state.result.stageIndex)} · CLEAR`;
      overlayCopy.innerHTML = `SCORE <b class="overlay-score">${String(finalScore).padStart(6, "0")}</b> / TARGET ${stageTargetLabel(resultStage)}<br />${state.result.newlyUnlocked ? `STAGE ${stageNumber(state.result.newlyUnlocked)} ${nextStage.name} OPEN` : `NEXT: STAGE ${stageNumber(state.selectedStageIndex)} ${nextStage.name}`}<br />${selectedStageDetail}`;
    }
    startButton.innerHTML = `<span>PLAY STAGE ${stageNumber(state.selectedStageIndex)} · TARGET ${stageTargetLabel(selected)}</span><b>↗</b>`;
  }
}

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.gameState = mode;
  canvas.dataset.gameState = mode;
  const isPaused = mode === "paused";
  const showStageSelector = mode === "ready" || mode === "over";
  overlay.classList.toggle("is-hidden", mode === "playing");
  stageSelector.hidden = !showStageSelector;
  ruleStrip.hidden = !isPaused && mode !== "playing";
  pauseButton.disabled = mode !== "playing" && !isPaused;
  touchDirectionButtons.forEach((button) => { button.disabled = mode !== "playing"; });
  pauseButton.innerHTML = isPaused ? "RESUME <span>▶</span>" : "PAUSE <span>Ⅱ</span>";
  touchDash.disabled = mode !== "playing" || state.dashCooldown > 0;
  renderStageSelector();
  renderOverlay();
  updateHud();
}

function beginGame() {
  if (!isStageUnlocked(state.selectedStageIndex)) return;
  ensureAudio();
  setRunStage(state.selectedStageIndex);
  resetWorld();
  state.result = null;
  setMode("playing");
  playSound("start");
  state.flash = 1;
  state.shake = 3;
  state.player.invuln = .9;
  showStageBanner();
  burst(state.player.x, state.player.y, state.stage.color, 12);
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
  state.score = Math.max(0, state.score - state.stage.hitPenalty);
  state.combo = 0;
  state.shake = 12;
  showToast(`SIGNAL LOST  /  -${state.stage.hitPenalty}`);
  burst(state.player.x, state.player.y, "#ff7653", 18);
  addFloatingText(state.player.x, state.player.y - 24, `−${state.stage.hitPenalty}`, "#ff7653");
  playSound("hit");
  checkTargetState();
}

function collectOrb(orb) {
  const base = orb.gold ? 100 : 40;
  const ruleMultiplier = state.rule?.id === "gold" ? 3 : 1;
  const gained = Math.round((base * ruleMultiplier + state.combo * 3) * state.stage.scoreMultiplier);
  state.score += gained;
  state.combo = Math.min(99, state.combo + 1);
  burst(orb.x, orb.y, orb.gold ? "#ffd765" : "#77e5ff", orb.gold ? 12 : 7);
  addFloatingText(orb.x, orb.y - 15, `+${gained} ${stageMultiplierLabel()}`, orb.gold ? "#ffd765" : "#77e5ff");
  playSound(orb.gold ? "gold" : "collect");
  if (state.rule?.id === "bloom" && state.orbs.length < state.stage.orbCount + BLOOM_ORB_BONUS_CAP) {
    state.orbs.push(createOrb());
  }
  Object.assign(orb, createOrb());
  checkTargetState();
}

function checkTargetState() {
  const isLocked = state.score >= state.stage.targetScore;
  if (isLocked === state.targetLocked) return;
  state.targetLocked = isLocked;
  state.flash = Math.max(state.flash, isLocked ? .8 : .48);
  state.shake = Math.max(state.shake, isLocked ? 7 : 4);
  showToast(isLocked ? "TARGET LOCKED  /  HOLD IT" : "TARGET LOST  /  PUSH");
  addFloatingText(state.player.x, state.player.y - 38, isLocked ? "TARGET LOCKED" : "TARGET LOST", isLocked ? "#d7ff52" : "#ff7653");
  playSound(isLocked ? "targetLocked" : "targetLost");
}

function addFloatingText(x, y, text, color) {
  state.floatingTexts.push({ x, y, text, color, life: .85, maxLife: .85 });
}

function reconcileAuthoritativeFinish(resultReference, authoritative) {
  state.progress = mergeProgress(state.progress, authoritative.progress);
  state.bestScore = Math.max(state.bestScore, storedScore(authoritative.bestScore));
  if (state.result === resultReference) resultReference.newlyUnlocked = authoritative.newlyUnlocked;
  if (state.mode === "ready" || state.mode === "over") {
    renderStageSelector();
    updateHud();
    renderOverlay();
  }
}

function finishGame() {
  if (state.mode !== "playing") return;
  const finalScore = Math.floor(state.score);
  const completedStageIndex = state.stageIndex;
  const completedStage = state.stage;
  const cleared = finalScore >= completedStage.targetScore;
  const finishSnapshot = {
    progress: mergeProgress(state.progress),
    bestScore: storedScore(state.bestScore),
    completedStageIndex,
    finalScore,
    cleared,
  };
  const immediate = applyFinishToProgress(
    finishSnapshot.progress,
    completedStageIndex,
    finalScore,
    cleared,
  );
  state.progress = immediate.progress;
  state.bestScore = Math.max(state.bestScore, storedScore(finalScore));
  const resultReference = {
    stageIndex: completedStageIndex,
    finalScore,
    cleared,
    newlyUnlocked: immediate.newlyUnlocked,
  };
  state.result = resultReference;
  if (cleared && completedStageIndex < STAGES.length - 1) {
    state.selectedStageIndex = completedStageIndex + 1;
    setRunStage(state.selectedStageIndex);
  }
  playSound("finish");
  setMode("over");
  void persistFinishSnapshot(finishSnapshot)
    .then((authoritative) => reconcileAuthoritativeFinish(resultReference, authoritative))
    .catch(() => { /* Immediate in-memory result remains usable if persistence fails unexpectedly. */ });
}

function burst(x, y, color, amount) {
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(35, 150);
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(.35, .8), maxLife: .8, size: rand(1, 4), color });
  }
}

function clampArenaPoint(point, radius = 0) {
  return {
    x: clamp(Number.isFinite(point?.x) ? point.x : W / 2, arena.x + radius, arena.x + arena.w - radius),
    y: clamp(Number.isFinite(point?.y) ? point.y : H / 2, arena.y + radius, arena.y + arena.h - radius),
  };
}

function playerMotionDirection(enemy) {
  const speed = Math.hypot(state.player.vx, state.player.vy);
  if (Number.isFinite(speed) && speed > 8) return { x: state.player.vx / speed, y: state.player.vy / speed };
  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  const distanceToPlayer = Math.hypot(dx, dy) || 1;
  return { x: dx / distanceToPlayer, y: dy / distanceToPlayer };
}

function nearestPlayerOrb() {
  return state.orbs.reduce((closest, orb) => (!closest || distance(state.player, orb) < distance(state.player, closest) ? orb : closest), null);
}

function enemyTarget(enemy) {
  const ai = state.stage.ai;
  const direction = playerMotionDirection(enemy);
  const predicted = clampArenaPoint({
    x: state.player.x + state.player.vx * ai.lead,
    y: state.player.y + state.player.vy * ai.lead,
  }, enemy.r);
  const current = clampArenaPoint(state.player, enemy.r);
  if (enemy.role === "interceptor") return predicted;
  if (enemy.role === "flanker") {
    const side = enemy.seed % 2 === 0 ? 1 : -1;
    return clampArenaPoint({
      x: predicted.x + (-direction.y * side * 112 * ai.formation),
      y: predicted.y + (direction.x * side * 112 * ai.formation),
    }, enemy.r);
  }
  if (enemy.role === "warden") {
    const orb = nearestPlayerOrb();
    if (orb) return clampArenaPoint(orb, enemy.r);
    return predicted;
  }
  if (enemy.role === "cutoff") {
    return clampArenaPoint({
      x: predicted.x + direction.x * 94 * ai.formation,
      y: predicted.y + direction.y * 94 * ai.formation,
    }, enemy.r);
  }
  return ai.level === 1 ? current : clampArenaPoint({
    x: lerp(current.x, predicted.x, .25),
    y: lerp(current.y, predicted.y, .25),
  }, enemy.r);
}

function separationSteering(enemy) {
  const separation = state.stage.ai.separation;
  let x = 0;
  let y = 0;
  for (const other of state.enemies) {
    if (other === enemy || other.spawnDelay > 0) continue;
    const dx = enemy.x - other.x;
    const dy = enemy.y - other.y;
    const spacing = Math.hypot(dx, dy);
    if (spacing > 70) continue;
    if (spacing < .001) {
      const angle = (enemy.seed + 1) * 2.399963229728653;
      x += Math.cos(angle) * separation;
      y += Math.sin(angle) * separation;
    } else {
      const force = (1 - spacing / 70) * separation;
      x += (dx / spacing) * force;
      y += (dy / spacing) * force;
    }
  }
  return { x, y };
}

function updateEnemy(enemy, dt) {
  if (enemy.spawnDelay > 0) {
    enemy.spawnDelay = Math.max(0, enemy.spawnDelay - dt);
    return;
  }
  const ai = state.stage.ai;
  const target = enemyTarget(enemy);
  const separation = separationSteering(enemy);
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const targetDistance = Math.hypot(dx, dy) || 1;
  let desiredX = dx / targetDistance + separation.x;
  let desiredY = dy / targetDistance + separation.y;
  if (state.rule?.id === "orbit") {
    const orbitCenter = clampArenaPoint({ x: lerp(W / 2, target.x, .62), y: lerp(H / 2, target.y, .62) }, enemy.r);
    const orbitAngle = Math.atan2(enemy.y - orbitCenter.y, enemy.x - orbitCenter.x) + dt * (.6 + enemy.seed * .035) * state.stage.enemySpeed;
    const radius = 130 + (enemy.seed % 4) * 18 + ai.formation * 30;
    const orbitPoint = clampArenaPoint({ x: orbitCenter.x + Math.cos(orbitAngle) * radius, y: orbitCenter.y + Math.sin(orbitAngle) * radius }, enemy.r);
    const orbitDx = orbitPoint.x - enemy.x;
    const orbitDy = orbitPoint.y - enemy.y;
    const orbitDistance = Math.hypot(orbitDx, orbitDy) || 1;
    desiredX = lerp(desiredX, orbitDx / orbitDistance + separation.x, ai.orbitBias);
    desiredY = lerp(desiredY, orbitDy / orbitDistance + separation.y, ai.orbitBias);
  }
  const desiredLength = Math.hypot(desiredX, desiredY) || 1;
  const overdrive = state.rule?.id === "overdrive" ? 1.3 : 1;
  const speedCap = 42 * state.stage.enemySpeed * overdrive;
  const desiredSpeed = Math.min(speedCap, speedCap * clamp(.58 + targetDistance / 170, .58, 1));
  const turn = clamp(ai.turning * dt, 0, 1);
  enemy.vx = lerp(enemy.vx, desiredX / desiredLength * desiredSpeed, turn);
  enemy.vy = lerp(enemy.vy, desiredY / desiredLength * desiredSpeed, turn);
  const actualSpeed = Math.hypot(enemy.vx, enemy.vy);
  if (!Number.isFinite(actualSpeed) || actualSpeed === 0) {
    enemy.vx = 0;
    enemy.vy = 0;
  } else if (actualSpeed > speedCap) {
    enemy.vx = enemy.vx / actualSpeed * speedCap;
    enemy.vy = enemy.vy / actualSpeed * speedCap;
  }
  enemy.x = clamp(enemy.x + enemy.vx * dt, arena.x + enemy.r, arena.x + arena.w - enemy.r);
  enemy.y = clamp(enemy.y + enemy.vy * dt, arena.y + enemy.r, arena.y + arena.h - enemy.r);
  if (distance(state.player, enemy) < state.player.r + enemy.r + 2) hitPlayer();
}

function update(dt) {
  let remaining = clamp(dt, 0, Math.max(0, RUN_DURATION - state.elapsed));
  while (remaining > 0 && state.mode === "playing") {
    // Advance rule boundaries exactly, while keeping individual physics steps stable.
    if (state.elapsed >= state.nextRuleAt) {
      nextRule();
      continue;
    }
    const untilRuleChange = Math.max(0, state.nextRuleAt - state.elapsed);
    const step = Math.min(MAX_SIMULATION_STEP, remaining, untilRuleChange);
    updateStep(step);
    remaining = Math.max(0, remaining - step);
  }
}

function updateStep(dt) {
  state.elapsed = clamp(state.elapsed + dt, 0, RUN_DURATION);
  if (RUN_DURATION - state.elapsed <= RUN_DURATION_EPSILON) {
    state.elapsed = RUN_DURATION;
    state.time = 0;
  } else {
    state.time = RUN_DURATION - state.elapsed;
  }
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
  state.player.invuln = Math.max(0, state.player.invuln - dt);
  state.stageBannerTimer = Math.max(0, state.stageBannerTimer - dt);
  if (state.stageBannerTimer <= 0) stageBanner.classList.remove("is-visible");
  state.flash = Math.max(0, state.flash - dt * 2.5);
  state.shake = Math.max(0, state.shake - dt * 18);
  state.toastTimer -= dt;
  if (state.toastTimer <= 0) toast.classList.remove("is-visible");

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

  for (const enemy of state.enemies) updateEnemy(enemy, dt);

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
  state.score += dt * 2 * state.stage.scoreMultiplier;
  checkTargetState();
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
  glow.addColorStop(0, `${state.stage.color}19`);
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
  const roleColors = { hunter: "#ff7653", interceptor: "#ffd765", flanker: "#bca9ff", warden: "#77e5ff", cutoff: "#d7ff52" };
  const color = state.rule?.id === "overdrive" ? "#ff4f32" : roleColors[enemy.role] || "#ff7653";
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(Math.atan2(enemy.vy, enemy.vx));
  ctx.shadowBlur = state.rule?.id === "overdrive" ? 20 : 13;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = enemy.spawnDelay > 0 ? .28 : .92;
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
  ctx.fillStyle = "rgba(241,240,232,.9)";
  if (enemy.role === "interceptor") ctx.fillRect(-6, -2, 3, 4);
  else if (enemy.role === "flanker") { ctx.beginPath(); ctx.arc(-5, 0, 2, 0, Math.PI * 2); ctx.fill(); }
  else if (enemy.role === "warden") { ctx.fillRect(-7, -3, 3, 6); ctx.fillRect(-3, -1, 3, 2); }
  else if (enemy.role === "cutoff") { ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill(); }
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
  ctx.font = "500 13px ui-monospace, monospace";
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
  ctx.font = "10px ui-monospace, monospace";
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
  const dt = Math.max(0, (now - state.last) / 1000);
  state.last = now;
  if (state.mode === "playing") update(dt);
  draw(now);
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const interactiveTarget = event.target instanceof Element
    ? event.target.closest("button, a[href], input, select, textarea, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='link']")
    : null;
  if (interactiveTarget && (key === "enter" || key === "return" || key === " ")) return;
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
window.addEventListener("storage", (event) => {
  if (event.key === PROGRESS_STORAGE_KEY) {
    state.progress = mergeProgress(state.progress, readProgress());
  } else if (event.key === BEST_STORAGE_KEY) {
    state.bestScore = Math.max(state.bestScore, readStoredScore(BEST_STORAGE_KEY));
  } else {
    return;
  }
  if (state.mode === "ready" || state.mode === "over") {
    renderStageSelector();
    updateHud();
    renderOverlay();
  }
});
startButton.addEventListener("click", () => {
  if (state.mode === "paused") togglePause();
  else beginGame();
});
pauseButton.addEventListener("click", togglePause);
for (const option of stageOptions) {
  option.addEventListener("click", () => selectStage(Number.parseInt(option.dataset.stageIndex, 10)));
}
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
