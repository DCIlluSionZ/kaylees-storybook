(function () {
  'use strict';

  const els = {
    screens: {
      cover: document.getElementById('screen-cover'),
      book: document.getElementById('screen-book'),
      end: document.getElementById('screen-end'),
    },
    topicInput: document.getElementById('topic-input'),
    topicChips: document.getElementById('topic-chips'),
    startBtn: document.getElementById('start-btn'),
    bookTitle: document.getElementById('book-title'),
    pageIndicator: document.getElementById('page-indicator'),
    illustration: document.getElementById('book-illustration'),
    bookText: document.getElementById('book-text'),
    bookNav: document.getElementById('book-nav'),
    nextBtn: document.getElementById('next-btn'),
    bookChoices: document.getElementById('book-choices'),
    loader: document.getElementById('loader'),
    loaderText: document.getElementById('loader-text'),
    replayBtn: document.getElementById('replay-btn'),
    muteBtn: document.getElementById('mute-btn'),
    muteIcon: document.getElementById('mute-icon'),
    muteLabel: document.getElementById('mute-label'),
    endSubtitle: document.getElementById('end-subtitle'),
    rereadBtn: document.getElementById('reread-btn'),
    anotherBtn: document.getElementById('another-btn'),
  };

  const state = {
    bookId: null,
    title: '',
    totalPages: 10,
    currentPageNumber: 0,
    pages: [],
    isMuted: false,
    isLoading: false,
    chosenVoice: null,
  };

  const tts = {
    supported: 'speechSynthesis' in window,
    pickVoice() {
      if (!tts.supported) return null;
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const score = (v) => {
        const name = v.name || '';
        const lang = (v.lang || '').toLowerCase();
        if (!/^en/.test(lang)) return -100;
        let s = 0;
        if (/premium/i.test(name)) s += 100;
        else if (/enhanced/i.test(name)) s += 60;
        else if (v.localService) s += 30;
        if (/natural|neural/i.test(name)) s += 50;
        if (/samantha|ava|allison|jenny|aria|karen|moira|libby|sonia|susan/i.test(name)) s += 20;
        if (/female/i.test(name)) s += 10;
        if (lang.startsWith('en-us')) s += 5;
        else if (lang.startsWith('en-gb') || lang.startsWith('en-au')) s += 3;
        if (/google\s+us\s+english$/i.test(name)) s -= 15;
        return s;
      };
      let best = voices[0];
      let bestScore = score(best);
      for (let i = 1; i < voices.length; i++) {
        const sc = score(voices[i]);
        if (sc > bestScore) { best = voices[i]; bestScore = sc; }
      }
      return best;
    },
    speak(text) {
      if (!tts.supported || state.isMuted || !text) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.92;
        utter.pitch = 1.0;
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
    stop() { if (tts.supported) window.speechSynthesis.cancel(); },
  };
  if (tts.supported && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => { state.chosenVoice = tts.pickVoice(); };
  }

  function showScreen(name) {
    Object.entries(els.screens).forEach(([key, el]) => { el.hidden = (key !== name); });
  }

  function setLoading(loading, message) {
    state.isLoading = loading;
    els.loader.hidden = !loading;
    if (message) els.loaderText.textContent = message;
    els.nextBtn.disabled = loading;
    els.startBtn.disabled = loading;
    els.bookChoices.querySelectorAll('button').forEach((b) => { b.disabled = loading; });
  }

  function showError(message, retryFn) {
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = message;
    els.bookChoices.innerHTML = '';
    els.bookChoices.hidden = false;
    els.bookChoices.appendChild(banner);

    if (typeof retryFn === 'function') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'choice-btn';
      retry.textContent = 'Try Again';
      retry.addEventListener('click', retryFn);
      els.bookChoices.appendChild(retry);
    }
  }

  async function callApi(url, payload) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      throw new Error(`Network error: ${networkErr.message || networkErr}`);
    }
    const rawBody = await res.text().catch(() => '');
    let data = {};
    try { data = rawBody ? JSON.parse(rawBody) : {}; } catch (_e) { /* not JSON */ }
    if (!res.ok) {
      const snippet = rawBody ? rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) : '';
      const detail = data.error || snippet || `HTTP ${res.status} ${res.statusText || ''}`.trim();
      throw new Error(`[${res.status}] ${detail}`);
    }
    return data;
  }

  function renderIllustration(dataUrl) {
    els.illustration.innerHTML = '';
    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'Storybook illustration';
      els.illustration.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'illustration-placeholder';
      ph.innerHTML = '<span class="illustration-placeholder__wand">&#10024;</span><span>Picture not ready</span>';
      els.illustration.appendChild(ph);
    }
  }

  function renderPage(page) {
    state.currentPageNumber = page.pageNumber;
    state.pages[page.pageNumber - 1] = page;

    els.pageIndicator.textContent = `Page ${page.pageNumber} of ${state.totalPages}`;
    if (state.title) els.bookTitle.textContent = state.title;

    renderIllustration(page.imageDataUrl);

    els.bookText.classList.remove('is-visible');
    els.bookText.classList.add('is-fading');
    setTimeout(() => {
      els.bookText.textContent = page.text;
      els.bookText.classList.remove('is-fading');
      els.bookText.classList.add('is-visible');
    }, 180);

    els.bookChoices.innerHTML = '';
    if (page.isFinalPage) {
      els.bookChoices.hidden = true;
      els.bookNav.hidden = true;
      setTimeout(showEnd, 1200);
      return;
    }
    if (page.isChoicePage && page.choices.length) {
      els.bookNav.hidden = true;
      els.bookChoices.hidden = false;
      page.choices.forEach((choiceText, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice-btn';
        btn.textContent = choiceText;
        btn.setAttribute('aria-label', `Choice ${i + 1}: ${choiceText}`);
        btn.addEventListener('click', () => {
          tts.stop();
          turnPage(choiceText);
        });
        els.bookChoices.appendChild(btn);
      });
    } else {
      els.bookChoices.hidden = true;
      els.bookNav.hidden = false;
    }
  }

  function showEnd() {
    tts.stop();
    if (state.title) {
      els.endSubtitle.textContent = `You finished "${state.title}"!`;
    } else {
      els.endSubtitle.textContent = 'What a magical adventure!';
    }
    showScreen('end');
  }

  async function startBook() {
    if (state.isLoading) return;
    const topic = els.topicInput.value.trim() || 'a magical surprise adventure';

    tts.stop();
    state.bookId = null; state.title = ''; state.pages = []; state.currentPageNumber = 0;
    showScreen('book');
    els.bookTitle.textContent = 'Creating your story...';
    els.pageIndicator.textContent = `Page 1 of ${state.totalPages}`;
    els.bookText.textContent = '';
    els.bookNav.hidden = true;
    els.bookChoices.hidden = true;
    renderIllustration(null);
    setLoading(true, 'Lucy is sprinkling story magic...');

    try {
      const data = await callApi('/api/book/start', { topic });
      state.bookId = data.bookId;
      state.title = data.title || 'Kaylee\'s Storybook';
      state.totalPages = data.totalPages || state.totalPages;
      renderPage(data.page);
    } catch (err) {
      console.error(err);
      showError(err.message || 'Oh no! The fairy magic fizzled. Please try again.', startBook);
    } finally {
      setLoading(false);
    }
  }

  async function turnPage(choice) {
    if (state.isLoading || !state.bookId) return;
    setLoading(true, 'Lucy is painting the next page...');
    try {
      const data = await callApi('/api/book/next', { bookId: state.bookId, choice: choice || null });
      if (data.title && !state.title) state.title = data.title;
      renderPage(data.page);
    } catch (err) {
      console.error(err);
      showError(err.message || 'Oh no! The fairy magic fizzled. Please try again.', () => turnPage(choice));
    } finally {
      setLoading(false);
    }
  }

  function rereadBook() {
    if (!state.pages.length) return;
    tts.stop();
    showScreen('book');
    let i = 0;
    const playNext = () => {
      if (i >= state.pages.length) { showEnd(); return; }
      const page = state.pages[i++];
      els.pageIndicator.textContent = `Page ${page.pageNumber} of ${state.totalPages}`;
      renderIllustration(page.imageDataUrl);
      els.bookText.classList.remove('is-visible');
      els.bookText.classList.add('is-fading');
      setTimeout(() => {
        els.bookText.textContent = page.text;
        els.bookText.classList.remove('is-fading');
        els.bookText.classList.add('is-visible');
      }, 200);
      els.bookChoices.hidden = true;
      els.bookChoices.innerHTML = '';
      els.bookNav.hidden = false;
      els.nextBtn.onclick = playNext;
    };
    els.nextBtn.onclick = playNext;
    playNext();
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
    }
  }

  els.startBtn.addEventListener('click', startBook);
  els.nextBtn.addEventListener('click', () => { tts.stop(); turnPage(null); });
  els.replayBtn.addEventListener('click', () => {
    const currentPage = state.pages[state.currentPageNumber - 1];
    if (currentPage) tts.speak(currentPage.text);
  });
  els.muteBtn.addEventListener('click', toggleMute);
  els.rereadBtn.addEventListener('click', rereadBook);
  els.anotherBtn.addEventListener('click', () => {
    tts.stop();
    showScreen('cover');
    els.topicInput.value = '';
    els.topicChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-selected'));
  });

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function tidyTopicInput() {
    els.topicInput.value = els.topicInput.value
      .replace(/\s*,\s*,\s*/g, ', ')
      .replace(/^[\s,]+|[\s,]+$/g, '');
  }
  function syncChipStates() {
    const v = els.topicInput.value.toLowerCase();
    els.topicChips.querySelectorAll('.chip').forEach((c) => {
      const topic = (c.dataset.topic || c.textContent.trim()).toLowerCase();
      c.classList.toggle('is-selected', topic.length > 0 && v.includes(topic));
    });
  }
  els.topicChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const topic = chip.dataset.topic || chip.textContent.trim();
    if (chip.classList.contains('is-selected')) {
      const esc = escapeRegex(topic);
      let v = els.topicInput.value;
      const before = v;
      v = v.replace(new RegExp('\\s*,\\s*' + esc, 'i'), '');
      if (v === before) v = v.replace(new RegExp(esc + '\\s*,\\s*', 'i'), '');
      if (v === before) v = v.replace(new RegExp(esc, 'i'), '');
      els.topicInput.value = v;
    } else {
      const current = els.topicInput.value.trim().replace(/,\s*$/, '');
      els.topicInput.value = current ? current + ', ' + topic : topic;
    }
    tidyTopicInput();
    syncChipStates();
    els.topicInput.focus();
  });
  els.topicInput.addEventListener('input', syncChipStates);

  els.topicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); startBook(); }
  });
})();
