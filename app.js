/**
 * ShadowScript — Shadow Boxing Trainer
 * Coach brain, speech, state machine, persistence.
 */
(function () {
  'use strict';

  // ——— Constants: DSL & mode params ———
  const PUNCH_NAMES = {
    1: 'Jab', 2: 'Cross', 3: 'Hook', 4: 'Rear Hook',
    5: 'Lead Uppercut', 6: 'Rear Uppercut',
    7: 'Slip Left', 8: 'Slip Right', 9: 'Roll', 0: 'Reset'
  };
  const PUNCH_SHORT = {
    5: 'Upper', 6: 'Upper'
  };
  const MODES = {
    easy: { comboMin: 2, comboMax: 3, intraPause: 1000, resetPause: 4000, defenseChance: 0.10 },
    medium: { comboMin: 3, comboMax: 5, intraPause: 1000, resetPause: 2500, defenseChance: 0.30 },
    hard: { comboMin: 5, comboMax: 8, intraPause: 1000, resetPause: 1500, defenseChance: 0.50 }
  };
  const WARMUP_SEC = 10;
  const BURNOUT_SEC = 15;
  const BURNOUT_COMBO = [1, 2, 1, 2];

  // ——— State ———
  let state = 'idle'; // idle | warmup | running | rest | paused | finished
  let currentRound = 0;
  let totalRounds = 3;
  let roundDurationSec = 180;
  let roundStartTime = 0;
  let roundElapsedSec = 0;
  let timerInterval = null;
  let comboQueue = [];
  let comboIndex = 0;
  let lastCombo = null;
  let pivotRepeatCount = 0;
  let wakeLock = null;
  let restElapsedSec = 0;
  let isPaused = false;
  let pausedElapsedSec = 0;
  let pausedState = '';
  let pausedRestLeft = 0;
  let pausedRestTotal = 0;
  let restTimeout = null;
  let restLeftSec = 0;
  let restTotalSec = 0;

  // ——— DOM ———
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const setupView = document.getElementById('setup-view');
  const trainingView = document.getElementById('training-view');
  const finishedView = document.getElementById('finished-view');
  const bigTimer = document.getElementById('big-timer');
  const roundLabel = document.getElementById('round-label');
  const stateLabel = document.getElementById('state-label');
  const comboTrack = document.getElementById('combo-track');
  const btnStart = document.getElementById('btn-start');
  const btnEnd = document.getElementById('btn-end');
  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');
  const btnRef = document.getElementById('btn-ref');
  const btnRefTraining = document.getElementById('btn-ref-training');
  const refModal = document.getElementById('ref-modal');
  const modalClose = document.getElementById('modal-close');
  const speechRateSlider = document.getElementById('speech-rate');
  const speechRateLabel = document.getElementById('speech-rate-label');
  const comboPaceSlider = document.getElementById('combo-pace');
  const comboPaceLabel = document.getElementById('combo-pace-label');

  // ——— Persistence ———
  const STORAGE_KEYS = { routines: 'shadowscript_routines', settings: 'shadowscript_settings' };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.settings);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.rounds != null) document.getElementById('rounds').value = s.rounds;
      if (s.roundDuration != null) document.getElementById('round-duration').value = s.roundDuration;
      if (s.difficulty) document.getElementById('difficulty').value = s.difficulty;
      if (s.southpaw != null) setSouthpaw(!!s.southpaw);
      if (s.coachPersonality) document.getElementById('coach-personality').value = s.coachPersonality;
      if (s.speechRate != null && speechRateSlider) {
        speechRateSlider.value = s.speechRate;
        if (speechRateLabel) speechRateLabel.textContent = Number(s.speechRate).toFixed(1) + 'x';
      }
      if (s.comboPace != null && comboPaceSlider) {
        comboPaceSlider.value = s.comboPace;
        if (comboPaceLabel) comboPaceLabel.textContent = Number(s.comboPace).toFixed(1) + 'x';
      }
    } catch (_) { }
  }

  function saveSettings() {
    const southpawEl = document.getElementById('toggle-southpaw');
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      rounds: parseInt(document.getElementById('rounds').value, 10) || 3,
      roundDuration: parseInt(document.getElementById('round-duration').value, 10) || 180,
      difficulty: document.getElementById('difficulty').value || 'medium',
      southpaw: southpawEl && southpawEl.classList.contains('on'),
      coachPersonality: document.getElementById('coach-personality').value || 'standard',
      speechRate: parseFloat(speechRateSlider.value) || 1,
      comboPace: parseFloat(comboPaceSlider?.value) || 1
    }));
  }

  function loadRoutines() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.routines);
      if (raw !== null) {
        document.getElementById('custom-routine').value = raw;
      }
    } catch (_) { }
  }

  function saveRoutines() {
    const val = document.getElementById('custom-routine').value.trim();
    localStorage.setItem(STORAGE_KEYS.routines, val);
  }

  function setSouthpaw(on) {
    const t = document.getElementById('toggle-southpaw');
    if (!t) return;
    t.classList.toggle('on', on);
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  document.getElementById('toggle-southpaw').addEventListener('click', function () {
    setSouthpaw(!this.classList.contains('on'));
  });

  // ——— Custom routine validation ———
  function parseCustomRoutine(text) {
    const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
    const combos = [];
    const re = /^[0-9\-]+$/;
    for (const line of lines) {
      if (!re.test(line)) continue;
      const moves = line.split('-').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n) && n >= 0 && n <= 9);
      if (moves.length) combos.push(moves);
    }
    return combos;
  }

  // ——— Coach Brain: weighted combo generation ———
  const OFFENSE = [1, 2, 3, 4, 5, 6];
  const DEFENSE = [7, 8, 9];

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickDefense(southpaw) {
    const i = randomInt(0, DEFENSE.length - 1);
    let d = DEFENSE[i];
    if (southpaw) {
      if (d === 7) d = 8;
      else if (d === 8) d = 7;
    }
    return d;
  }

  function generateCombo(modeKey, southpaw) {
    const m = MODES[modeKey] || MODES.medium;
    const len = randomInt(m.comboMin, m.comboMax);
    const useDefense = Math.random() < m.defenseChance;
    const out = [];
    for (let i = 0; i < len; i++) {
      if (useDefense && i > 0 && Math.random() < 0.4) {
        out.push(pickDefense(southpaw));
      } else {
        out.push(OFFENSE[randomInt(0, OFFENSE.length - 1)]);
      }
    }
    return out;
  }

  function shouldPivot() {
    return lastCombo && Math.random() < 0.35 && pivotRepeatCount >= 1;
  }

  function getNextCombo(modeKey, customCombos, southpaw) {
    const mode = modeKey && MODES[modeKey] ? modeKey : 'medium';
    if (customCombos && customCombos.length) {
      const idx = randomInt(0, customCombos.length - 1);
      return customCombos[idx].slice();
    }
    if (shouldPivot() && lastCombo) {
      const variation = lastCombo.slice();
      const insertDef = DEFENSE[randomInt(0, DEFENSE.length - 1)];
      const pos = Math.min(randomInt(1, variation.length), variation.length - 1);
      variation.splice(pos, 0, southpaw ? (insertDef === 7 ? 8 : insertDef === 8 ? 7 : 9) : insertDef);
      return variation;
    }
    if (lastCombo && pivotRepeatCount < 1 && Math.random() < 0.4) {
      pivotRepeatCount++;
      return lastCombo.slice();
    }
    pivotRepeatCount = 0;
    const next = generateCombo(mode, southpaw);
    lastCombo = next;
    return next;
  }

  // ——— Speech ———
  let selectedVoice = null;
  let speaking = false;

  function loadVoices() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    selectedVoice =
      voices.find(function (v) { return v.name.indexOf('Google') !== -1 && v.lang === 'en-US'; }) ||
      voices.find(function (v) { return v.lang === 'en-US'; }) ||
      voices[0];
  }
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
  }

  function formatComboForSpeech(combo) {
    const mapping = {
      0: 'Reset',
      1: 'Jab',
      2: 'Cross',
      3: 'Hook',
      4: 'Rear Hook',
      5: 'Lead Uppercut',
      6: 'Rear Uppercut',
      7: 'Slip Left',
      8: 'Slip Right',
      9: 'Roll'
    };
    if (typeof combo !== 'string') return '';
    return combo.split('-').map(function (n) { return mapping[n] || ''; }).filter(Boolean).join(', ');
  }

  function speakCombo(comboText, raw) {
    if (!window.speechSynthesis || !comboText) return;
    speechSynthesis.cancel();

    const personality = document.getElementById('coach-personality').value;

    let textToSpeak = raw ? comboText : formatComboForSpeech(comboText);

    // Apply personality tweaks after mapping
    if (!raw) {
      if (personality === 'aggressive') {
        textToSpeak = textToSpeak.replace(/, /g, '! ') + '!';
      } else if (personality === 'minimal') {
        // Minimal leaves it mostly as is, maybe slightly shorter
        textToSpeak = textToSpeak.replace(/Lead /g, '').replace(/Rear /g, '');
      }
    }

    const utterance = new SpeechSynthesisUtterance();
    utterance.text = textToSpeak;
    utterance.voice = selectedVoice;
    utterance.lang = 'en-US';
    utterance.volume = 1;
    utterance.pitch = 1;

    const baseRate = personality === 'minimal' ? 0.85 : personality === 'aggressive' ? 1.0 : 0.9;
    const userRate = parseFloat(speechRateSlider?.value, 10) || 1;
    utterance.rate = baseRate * userRate;

    speaking = true;
    utterance.onend = function () { speaking = false; };
    utterance.onerror = function () { speaking = false; };
    speechSynthesis.speak(utterance);
  }

  function speakRoundIntro(round, total) {
    speakCombo('Round ' + round + ' of ' + total + '. Begin.', true);
  }

  function comboToNames(combo, shortForm) {
    const southpaw = document.getElementById('toggle-southpaw').classList.contains('on');
    return combo.map(function (n) {
      let name = PUNCH_NAMES[n];
      if (southpaw && (n === 7 || n === 8)) name = n === 7 ? 'Slip Right' : 'Slip Left';
      if (shortForm && PUNCH_SHORT[n]) name = PUNCH_SHORT[n];
      return name;
    }).join(', ');
  }

  // ——— Wake Lock ———
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        if (wakeLock !== null) return;
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', function () {
          wakeLock = null;
        });
      }
    } catch (_) { }
  }

  // Handle visibility changes to retain wake lock
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state !== 'idle' && state !== 'finished') {
      requestWakeLock();
    }
  });

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (_) { }
      wakeLock = null;
    }
  }

  // ——— Haptics ———
  function vibrate(pattern) {
    if (window.navigator.vibrate) window.navigator.vibrate(pattern);
  }

  // ——— UI helpers ———
  function showView(name) {
    setupView.style.display = name === 'setup' ? 'block' : 'none';
    trainingView.classList.remove('active');
    finishedView.classList.remove('active');
    if (name === 'training') {
      trainingView.classList.add('active');
      progressBar.classList.add('active');
    } else {
      progressBar.classList.remove('active');
    }
    if (name === 'finished') {
      finishedView.classList.add('active');
    }
  }

  function setState(s) {
    state = s;
    stateLabel.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    trainingView.classList.remove('rest', 'burnout');
    if (s === 'rest') trainingView.classList.add('rest');
    if (s === 'running' && isBurnoutPhase()) trainingView.classList.add('burnout');
  }

  function getMode() {
    const modeKey = document.getElementById('difficulty').value;
    return MODES[modeKey] || MODES.medium;
  }

  function getTotalWorkoutSec() {
    const m = getMode();
    const restSec = (m.resetPause / 1000) * Math.max(0, totalRounds - 1);
    return totalRounds * (WARMUP_SEC + roundDurationSec) + restSec;
  }

  function updateProgress() {
    const totalSec = getTotalWorkoutSec();
    const m = getMode();
    const restSec = m.resetPause / 1000;
    let elapsed = (currentRound - 1) * (WARMUP_SEC + roundDurationSec + restSec);
    if (state === 'warmup') elapsed += roundElapsedSec;
    else if (state === 'running') elapsed += WARMUP_SEC + roundElapsedSec;
    else if (state === 'rest') elapsed += WARMUP_SEC + roundDurationSec + restElapsedSec;
    const p = totalSec > 0 ? Math.min(100, (elapsed / totalSec) * 100) : 0;
    progressFill.style.width = p + '%';
  }

  function renderComboTrack(highlightIndex) {
    const southpaw = document.getElementById('toggle-southpaw').classList.contains('on');
    comboTrack.innerHTML = '';
    comboQueue.forEach((move, i) => {
      let label = PUNCH_NAMES[move];
      if (southpaw && (move === 7 || move === 8)) label = move === 7 ? 'Slip R' : 'Slip L';
      const chip = document.createElement('span');
      let stateClass = 'next';
      if (i < highlightIndex) stateClass = 'prev';
      else if (i === highlightIndex) stateClass = 'current';
      chip.className = 'combo-chip ' + stateClass;
      chip.textContent = label;
      comboTrack.appendChild(chip);
    });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function isBurnoutPhase() {
    return currentRound === totalRounds && roundElapsedSec >= roundDurationSec - BURNOUT_SEC && state === 'running';
  }

  // ——— Timer & round flow ———
  function startRound() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (restInterval) {
      clearInterval(restInterval);
      restInterval = null;
    }
    if (restTimeout) {
      clearTimeout(restTimeout);
      restTimeout = null;
    }
    roundStartTime = Date.now();
    roundElapsedSec = 0;
    const modeKey = document.getElementById('difficulty').value || 'medium';
    const m = getMode();
    const customText = document.getElementById('custom-routine').value.trim();
    const customCombos = customText ? parseCustomRoutine(customText) : null;
    const southpaw = document.getElementById('toggle-southpaw').classList.contains('on');

    setState('warmup');
    bigTimer.textContent = formatTime(WARMUP_SEC);
    comboQueue = [];
    comboIndex = 0;
    renderComboTrack(-1);

    timerInterval = setInterval(function () {
      if (state === 'paused') return;
      const elapsed = (Date.now() - roundStartTime) / 1000;
      roundElapsedSec = Math.floor(elapsed);

      if (state === 'warmup') {
        const left = WARMUP_SEC - roundElapsedSec;
        bigTimer.textContent = formatTime(Math.max(0, left));
        updateProgress();
        if (left <= 0) {
          setState('running');
          vibrate([100, 50, 100]);
          startRunningPhase(modeKey, m, customCombos, southpaw);
        }
        return;
      }

      if (state === 'running') {
        const roundSec = roundDurationSec;
        const left = roundSec - roundElapsedSec;
        bigTimer.textContent = formatTime(Math.max(0, left));
        updateProgress();

        if (isBurnoutPhase()) {
          if (!trainingView.classList.contains('burnout')) trainingView.classList.add('burnout');
        }

        if (left <= 0) {
          clearComboTimers();
          setState('rest');
          vibrate([200, 100, 200]);
          if (currentRound >= totalRounds) {
            setState('finished');
            showView('finished');
            document.getElementById('finished-message').textContent = 'All rounds done. Great work.';
            releaseWakeLock();
            progressFill.style.width = '100%';
            return;
          }
          const restMs = m.resetPause;
          if (restTimeout) clearTimeout(restTimeout);
          restTimeout = setTimeout(function () {
            restTimeout = null;
            currentRound++;
            roundLabel.textContent = 'Round ' + currentRound + ' of ' + totalRounds;
            startRound();
          }, restMs);
          restTotalSec = Math.ceil(restMs / 1000);
          bigTimer.textContent = formatTime(restTotalSec);
          restLeftSec = restTotalSec;
          restElapsedSec = 0;
          if (restInterval) clearInterval(restInterval);
          restInterval = setInterval(function () {
            restLeftSec--;
            restElapsedSec = restTotalSec - restLeftSec;
            bigTimer.textContent = formatTime(restLeftSec);
            updateProgress();
            if (restLeftSec <= 0) {
              clearInterval(restInterval);
              restInterval = null;
            }
          }, 1000);
        }
      }
    }, 200);
  }

  let comboTimeouts = [];
  let restInterval = null;

  function clearComboTimers() {
    comboTimeouts.forEach(t => clearTimeout(t));
    comboTimeouts = [];
    if (restInterval) {
      clearInterval(restInterval);
      restInterval = null;
    }
    if (restTimeout) {
      clearTimeout(restTimeout);
      restTimeout = null;
    }
  }

  function startRunningPhase(modeKey, m, customCombos, southpaw, skipIntro) {
    if (!skipIntro) speakRoundIntro(currentRound, totalRounds);

    function scheduleNext() {
      if (state !== 'running') return;
      const isBurnout = isBurnoutPhase();
      let nextCombo;
      if (isBurnout) {
        nextCombo = BURNOUT_COMBO.slice();
      } else {
        nextCombo = getNextCombo(modeKey, customCombos, southpaw);
      }
      comboQueue = nextCombo;
      comboIndex = 0;
      renderComboTrack(0);

      const comboForSpeech = comboQueue.map(function (n) {
        if (southpaw && n === 7) return 8;
        if (southpaw && n === 8) return 7;
        return n;
      }).join('-');
      speakCombo(comboForSpeech);

      const intraPause = isBurnout ? 250 : m.intraPause;
      comboQueue.forEach(function (_, i) {
        const t = setTimeout(function () {
          if (state !== 'running') return;
          comboIndex = i + 1;
          renderComboTrack(comboIndex);
        }, (i + 1) * intraPause);
        comboTimeouts.push(t);
      });

      const totalComboTime = comboQueue.length * intraPause;
      const paceMultiplier = parseFloat(comboPaceSlider?.value) || 1;
      const baseResetPause = isBurnout ? 200 : Math.max(m.resetPause, 3000);
      const resetPause = Math.round(baseResetPause * paceMultiplier);
      const t = setTimeout(function () {
        if (state !== 'running') return;
        scheduleNext();
      }, totalComboTime + resetPause);
      comboTimeouts.push(t);
    }

    setTimeout(scheduleNext, 2000);
  }

  function pauseWorkout() {
    if (state !== 'warmup' && state !== 'running' && state !== 'rest') return;
    isPaused = true;
    pausedState = state;
    pausedElapsedSec = roundElapsedSec;
    state = 'paused';
    stateLabel.textContent = 'Paused';
    trainingView.classList.add('paused');
    if (btnPause) {
      btnPause.textContent = 'Resume';
      btnPause.classList.add('paused');
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    clearComboTimers();
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (pausedState === 'rest') {
      pausedRestLeft = Math.max(0, restLeftSec);
      pausedRestTotal = restTotalSec || pausedRestLeft;
    }
  }

  function resumeWorkout() {
    if (state !== 'paused') return;
    isPaused = false;
    state = pausedState;
    trainingView.classList.remove('paused');
    if (btnPause) {
      btnPause.textContent = 'Pause';
      btnPause.classList.remove('paused');
    }
    const modeKey = document.getElementById('difficulty').value || 'medium';
    const m = getMode();
    const customText = document.getElementById('custom-routine').value.trim();
    const customCombos = customText ? parseCustomRoutine(customText) : null;
    const southpaw = document.getElementById('toggle-southpaw').classList.contains('on');

    if (state === 'rest') {
      const restMs = pausedRestLeft * 1000;
      if (restTimeout) clearTimeout(restTimeout);
      restTimeout = setTimeout(function () {
        restTimeout = null;
        currentRound++;
        roundLabel.textContent = 'Round ' + currentRound + ' of ' + totalRounds;
        startRound();
      }, restMs);
      restTotalSec = pausedRestTotal || pausedRestLeft;
      restElapsedSec = restTotalSec - pausedRestLeft;
      bigTimer.textContent = formatTime(pausedRestLeft);
      restLeftSec = pausedRestLeft;
      if (restInterval) clearInterval(restInterval);
      restInterval = setInterval(function () {
        restLeftSec--;
        restElapsedSec = restTotalSec - restLeftSec;
        bigTimer.textContent = formatTime(restLeftSec);
        updateProgress();
        if (restLeftSec <= 0) {
          clearInterval(restInterval);
          restInterval = null;
        }
      }, 1000);
      setState('rest');
      return;
    }

    roundStartTime = Date.now() - pausedElapsedSec * 1000;
    if (state === 'running') {
      startRunningPhase(modeKey, m, customCombos, southpaw, true);
    }
    timerInterval = setInterval(function () {
      if (state === 'paused') return;
      const elapsed = (Date.now() - roundStartTime) / 1000;
      roundElapsedSec = Math.floor(elapsed);

      if (state === 'warmup') {
        const left = WARMUP_SEC - roundElapsedSec;
        bigTimer.textContent = formatTime(Math.max(0, left));
        updateProgress();
        if (left <= 0) {
          setState('running');
          vibrate([100, 50, 100]);
          startRunningPhase(modeKey, m, customCombos, southpaw);
        }
        return;
      }

      if (state === 'running') {
        const roundSec = roundDurationSec;
        const left = roundSec - roundElapsedSec;
        bigTimer.textContent = formatTime(Math.max(0, left));
        updateProgress();
        if (isBurnoutPhase()) {
          if (!trainingView.classList.contains('burnout')) trainingView.classList.add('burnout');
        }
        if (left <= 0) {
          clearComboTimers();
          setState('rest');
          vibrate([200, 100, 200]);
          if (currentRound >= totalRounds) {
            setState('finished');
            showView('finished');
            document.getElementById('finished-message').textContent = 'All rounds done. Great work.';
            releaseWakeLock();
            progressFill.style.width = '100%';
            return;
          }
          const restMs = m.resetPause;
          if (restTimeout) clearTimeout(restTimeout);
          restTimeout = setTimeout(function () {
            restTimeout = null;
            currentRound++;
            roundLabel.textContent = 'Round ' + currentRound + ' of ' + totalRounds;
            startRound();
          }, restMs);
          restTotalSec = Math.ceil(restMs / 1000);
          bigTimer.textContent = formatTime(restTotalSec);
          restLeftSec = restTotalSec;
          restElapsedSec = 0;
          if (restInterval) clearInterval(restInterval);
          restInterval = setInterval(function () {
            restLeftSec--;
            restElapsedSec = restTotalSec - restLeftSec;
            bigTimer.textContent = formatTime(restLeftSec);
            updateProgress();
            if (restLeftSec <= 0) {
              clearInterval(restInterval);
              restInterval = null;
            }
          }, 1000);
        }
      }
    }, 200);
    setState(state);
  }

  function togglePause() {
    if (state === 'paused') {
      initializeSpeechEngine();
      resumeWorkout();
    } else {
      pauseWorkout();
    }
  }

  function stopWorkout() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    clearInterval(timerInterval);
    timerInterval = null;
    clearComboTimers();
    setState('idle');
    releaseWakeLock();
    showView('setup');
    progressBar.classList.remove('active');
    progressFill.style.width = '0%';
    if (btnPause) {
      btnPause.textContent = 'Pause';
      btnPause.classList.remove('paused');
    }
  }

  // ——— Event bindings ———

  function initializeSpeechEngine() {
    // Silent warm-up utterance to unblock iOS Safari speech APIs
    if (window.speechSynthesis) {
      const g = new SpeechSynthesisUtterance('');
      g.volume = 0;
      speechSynthesis.speak(g);
    }
  }

  btnStart.addEventListener('click', function () {
    initializeSpeechEngine();
    totalRounds = parseInt(document.getElementById('rounds').value, 10) || 3;
    roundDurationSec = parseInt(document.getElementById('round-duration').value, 10) || 180;
    currentRound = 1;
    lastCombo = null;
    pivotRepeatCount = 0;
    roundLabel.textContent = 'Round 1 of ' + totalRounds;
    saveSettings();
    saveRoutines();
    requestWakeLock();
    setupView.classList.add('fade-out');
    setTimeout(function () {
      showView('training');
      setupView.classList.remove('fade-out');
      progressFill.style.width = '0%';
      startRound();
    }, 300);
  });

  btnEnd.addEventListener('click', stopWorkout);
  if (btnPause) btnPause.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', function () {
    finishedView.classList.remove('active');
    showView('setup');
  });

  if (speechRateSlider && speechRateLabel) {
    speechRateSlider.addEventListener('input', function () {
      speechRateLabel.textContent = Number(this.value).toFixed(1) + 'x';
    });
  }
  if (comboPaceSlider && comboPaceLabel) {
    comboPaceSlider.addEventListener('input', function () {
      comboPaceLabel.textContent = Number(this.value).toFixed(1) + 'x';
    });
  }

  let refModalTrigger = null;

  function openRefModal(trigger) {
    refModalTrigger = trigger || btnRef;
    refModal.classList.add('active');
    refModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeRefModal() {
    refModal.classList.remove('active');
    refModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (refModalTrigger) refModalTrigger.focus();
    refModalTrigger = null;
  }

  btnRef.addEventListener('click', function () { openRefModal(btnRef); });
  if (btnRefTraining) btnRefTraining.addEventListener('click', function () { openRefModal(btnRefTraining); });
  modalClose.addEventListener('click', closeRefModal);
  refModal.addEventListener('click', function (e) {
    if (e.target === refModal) closeRefModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && refModal.classList.contains('active')) {
      closeRefModal();
    }
  });

  // Collapsible punch reference items
  refModal.querySelectorAll('.ref-item').forEach(function (item) {
    item.querySelector('.ref-item-header').addEventListener('click', function () {
      item.classList.toggle('expanded');
    });
  });

  loadSettings();
  loadRoutines();
})();
