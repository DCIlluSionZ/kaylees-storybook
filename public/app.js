(function () {
  'use strict';

  const els = {
    storyText: document.getElementById('story-text'),
    sceneLabel: document.getElementById('scene-label'),
    choices: document.getElementById('choices'),
    startBtn: document.getElementById('start-btn'),
    replayBtn: document.getElementById('replay-btn'),
    muteBtn: document.getElementById('mute-btn'),
    muteIcon: document.getElementById('mute-icon'),
    muteLabel: document.getElementById('mute-label'),
    loader: document.getElementById('loader'),
    restartBtn: document.getElementById('restart-btn'),
  };

  const state = {
    history: [],
    currentChunk: '',
    isLoading: false,
    isMuted: false,
    chosenVoice: null,
  };

  const tts = {
    supported: 'speechSynthesis' in window,
    pickVoice() {
      if (!tts.supported) return null;
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const preferred = [
        /en-US.*(Female|Samantha|Jenny|Aria|Ava|Zira)/i,
        /en-GB.*(Female|Libby|Sonia)/i,
        /Google US English/i,
        /en[-_]/i,
      ];
      for (const re of preferred) {
        const match = voices.find((v) => re.test(`${v.lang} ${v.name}`));
        if (match) return match;
      }
      return voices[0];
    },
    speak(text) {
      if (!tts.supported || state.isMuted || !text) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.95;
        utter.pitch = 1.15;
        utter.volume = 1;
        const voice = state.chosenVoice || tts.pickVoice();
        if (voice) {
          state.chosenVoice = voice;
          utter.voice = voice;
          utter.lang = voice.lang;
        }
        window.speechSynthesis.speak(utter);
      } catch (err) {
        console.warn('TTS failed:', err);
      }
    },
    stop() {
      if (tts.supported) window.speechSynthesis.cancel();
    },
  };

  if (tts.supported && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => {
      state.chosenVoice = tts.pickVoice();
    };
  }

  function setLoading(loading) {
    state.isLoading = loading;
    els.loader.hidden = !loading;
    els.choices.querySelectorAll('button').forEach((b) => {
      b.disabled = loading;
    });
  }

  function showError(message) {
    els.choices.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = message;
    els.choices.appendChild(banner);

    const retry = document.createElement('button');
    retry.className = 'choice-btn';
    retry.type = 'button';
    retry.textContent = 'Try Again';
    retry.addEventListener('click', () => {
      if (state.history.length === 0) {
        beginAdventure();
      } else {
        const lastUserTurn = [...state.history].reverse().find((t) => t.role === 'user');
        const lastChoice = lastUserTurn ? lastUserTurn.text : '';
        state.history = state.history.slice(0, -1);
        sendChoice(lastChoice);
      }
    });
    els.choices.appendChild(retry);
    els.restartBtn.hidden = false;
  }

  function renderStory({ chunk, choices, scene }) {
    state.currentChunk = chunk;

    els.sceneLabel.textContent = scene || 'Kaylee\'s Adventure';

    els.storyText.classList.remove('is-visible');
    els.storyText.classList.add('is-fading');
    setTimeout(() => {
      els.storyText.textContent = chunk;
      els.storyText.classList.remove('is-fading');
      els.storyText.classList.add('is-visible');
      tts.speak(chunk);
    }, 200);

    els.choices.innerHTML = '';
    choices.forEach((choiceText, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.textContent = choiceText;
      btn.setAttribute('aria-label', `Choice ${idx + 1}: ${choiceText}`);
      btn.addEventListener('click', () => {
        tts.stop();
        sendChoice(choiceText);
      });
      els.choices.appendChild(btn);
    });

    els.restartBtn.hidden = false;
  }

  async function callStoryApi(payload) {
    const res = await fetch('/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'The story magic got tangled. Please try again.');
    }
    return res.json();
  }

  async function beginAdventure() {
    if (state.isLoading) return;
    tts.stop();
    state.history = [];
    setLoading(true);
    try {
      const story = await callStoryApi({ history: [] });
      state.history.push({ role: 'user', text: 'Begin the adventure.' });
      state.history.push({ role: 'model', text: JSON.stringify(story) });
      renderStory(story);
    } catch (err) {
      console.error(err);
      showError(err.message || 'Oh no! The fairy magic fizzled. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function sendChoice(choice) {
    if (state.isLoading) return;
    setLoading(true);
    try {
      const story = await callStoryApi({ choice, history: state.history });
      state.history.push({ role: 'user', text: `Kaylee chose: "${choice}".` });
      state.history.push({ role: 'model', text: JSON.stringify(story) });
      renderStory(story);
    } catch (err) {
      console.error(err);
      showError(err.message || 'Oh no! The fairy magic fizzled. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function toggleMute() {
    state.isMuted = !state.isMuted;
    if (state.isMuted) {
      tts.stop();
      els.muteIcon.textContent = '🔇';
      els.muteLabel.textContent = 'Sound Off';
    } else {
      els.muteIcon.textContent = '🔊';
      els.muteLabel.textContent = 'Sound On';
      if (state.currentChunk) tts.speak(state.currentChunk);
    }
  }

  els.startBtn.addEventListener('click', beginAdventure);
  els.replayBtn.addEventListener('click', () => {
    if (state.currentChunk) tts.speak(state.currentChunk);
  });
  els.muteBtn.addEventListener('click', toggleMute);
  els.restartBtn.addEventListener('click', () => {
    tts.stop();
    els.restartBtn.hidden = true;
    els.sceneLabel.textContent = 'A New Adventure';
    els.storyText.textContent = 'Hi Kaylee! Press the big pink button to begin your magical adventure with Lucy the fairy.';
    els.storyText.classList.remove('is-fading');
    els.storyText.classList.add('is-visible');
    els.choices.innerHTML = '';
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'start-btn';
    startBtn.innerHTML = '<span class="start-btn__sparkle">✨</span> Start the Adventure <span class="start-btn__sparkle">✨</span>';
    startBtn.addEventListener('click', beginAdventure);
    els.choices.appendChild(startBtn);
    state.history = [];
    state.currentChunk = '';
  });
})();
