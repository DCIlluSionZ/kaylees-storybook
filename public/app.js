(function () {
  'use strict';

  const els = {
    screens: {
      cover: document.getElementById('screen-cover'),
      book: document.getElementById('screen-book'),
      end: document.getElementById('screen-end'),
    },
    topicInput: document.getElementById('topic-input'),
    topicMicBtn: document.getElementById('topic-mic-btn'),
    topicChips: document.getElementById('topic-chips'),
    startBtn: document.getElementById('start-btn'),
    aboutHair: document.getElementById('about-hair'),
    aboutFavColour: document.getElementById('about-fav-colour'),
    aboutPet: document.getElementById('about-pet'),
    library: document.getElementById('library'),
    libraryShelf: document.getElementById('library-shelf'),
    bookTitle: document.getElementById('book-title'),
    pageIndicator: document.getElementById('page-indicator'),
    illustration: document.getElementById('book-illustration'),
    bookText: document.getElementById('book-text'),
    bookNav: document.getElementById('book-nav'),
    nextBtn: document.getElementById('next-btn'),
    bookChoices: document.getElementById('book-choices'),
    voicePick: document.getElementById('voice-pick'),
    voicePickText: document.getElementById('voice-pick-text'),
    loader: document.getElementById('loader'),
    loaderText: document.getElementById('loader-text'),
    replayBtn: document.getElementById('replay-btn'),
    muteBtn: document.getElementById('mute-btn'),
    muteIcon: document.getElementById('mute-icon'),
    muteLabel: document.getElementById('mute-label'),
    endSubtitle: document.getElementById('end-subtitle'),
    saveBtn: document.getElementById('save-btn'),
    saveBtnLabel: document.getElementById('save-btn-label'),
    downloadBtn: document.getElementById('download-btn'),
    rereadBtn: document.getElementById('reread-btn'),
    anotherBtn: document.getElementById('another-btn'),
  };

  const LIBRARY_KEY = 'kaylee-storybook:library:v1';
  const ABOUT_KEY = 'kaylee-storybook:about:v1';

  const state = {
    bookId: null,
    title: '',
    topic: '',
    totalPages: 10,
    currentPageNumber: 0,
    pages: [],
    isMuted: false,
    isLoading: false,
    chosenVoice: null,
    wordSpans: [],
    karaokeTimer: null,
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
    speak(text, opts) {
      if (!tts.supported || state.isMuted || !text) return null;
      const options = opts || {};
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = options.rate != null ? options.rate : 0.92;
        utter.pitch = options.pitch != null ? options.pitch : 1.0;
        utter.volume = 1;
        const voice = state.chosenVoice || tts.pickVoice();
        if (voice) {
          state.chosenVoice = voice;
          utter.voice = voice;
          utter.lang = voice.lang;
        }
        if (typeof options.onBoundary === 'function') utter.addEventListener('boundary', options.onBoundary);
        if (typeof options.onEnd === 'function') utter.addEventListener('end', options.onEnd);
        if (typeof options.onStart === 'function') utter.addEventListener('start', options.onStart);
        window.speechSynthesis.speak(utter);
        return utter;
      } catch (err) {
        console.warn('TTS failed:', err);
        return null;
      }
    },
    stop() { if (tts.supported) window.speechSynthesis.cancel(); },
  };
  if (tts.supported && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = () => { state.chosenVoice = tts.pickVoice(); };
  }

  function clearKaraoke() {
    if (state.karaokeTimer) { clearInterval(state.karaokeTimer); state.karaokeTimer = null; }
    state.wordSpans.forEach((s) => s.classList.remove('is-reading'));
  }

  function renderTextWithSpans(container, text) {
    container.textContent = '';
    state.wordSpans = [];
    const parts = text.split(/(\s+)/);
    parts.forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        container.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('mark');
        span.textContent = part;
        container.appendChild(span);
        state.wordSpans.push(span);
      }
    });
  }

  function highlightWordIndex(index) {
    state.wordSpans.forEach((s, i) => s.classList.toggle('is-reading', i === index));
  }

  function startKaraokeFallback(durationMs) {
    if (!state.wordSpans.length) return;
    const perWord = Math.max(180, durationMs / state.wordSpans.length);
    let i = 0;
    highlightWordIndex(i);
    state.karaokeTimer = setInterval(() => {
      i++;
      if (i >= state.wordSpans.length) { clearKaraoke(); return; }
      highlightWordIndex(i);
    }, perWord);
  }

  function speakPageWithKaraoke(text) {
    if (!tts.supported || state.isMuted) return;
    clearKaraoke();
    let boundaryFired = false;
    const fallbackDuration = Math.max(4000, text.length * 60);
    const utter = tts.speak(text, {
      onStart: () => {
        setTimeout(() => {
          if (!boundaryFired) startKaraokeFallback(fallbackDuration);
        }, 700);
      },
      onBoundary: (e) => {
        if (e.name !== 'word' && e.name !== undefined) return;
        boundaryFired = true;
        if (state.karaokeTimer) { clearInterval(state.karaokeTimer); state.karaokeTimer = null; }
        const charIndex = e.charIndex || 0;
        const upto = text.slice(0, charIndex);
        const wordIndex = (upto.match(/\S+/g) || []).length;
        highlightWordIndex(wordIndex);
      },
      onEnd: () => { clearKaraoke(); },
    });
    if (!utter) clearKaraoke();
  }

  const recog = (function () {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    return {
      Ctor: SR,
      current: null,
      start(options) {
        try { if (recog.current) recog.current.abort(); } catch (_e) {}
        const r = new SR();
        r.lang = options.lang || 'en-US';
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.continuous = false;
        if (typeof options.onResult === 'function') {
          r.addEventListener('result', (e) => {
            const last = e.results[e.results.length - 1];
            if (last && last[0]) options.onResult(String(last[0].transcript || '').trim());
          });
        }
        if (typeof options.onEnd === 'function') r.addEventListener('end', options.onEnd);
        if (typeof options.onError === 'function') r.addEventListener('error', options.onError);
        recog.current = r;
        try { r.start(); } catch (err) { console.warn('SpeechRecognition start failed', err); }
        return r;
      },
      stop() {
        try { if (recog.current) { recog.current.abort(); recog.current = null; } } catch (_e) {}
      },
    };
  })();

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
    const stripHtml = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    let data = null;
    if (rawBody) {
      try { data = JSON.parse(rawBody); } catch (_e) { /* not JSON */ }
    }
    if (!res.ok) {
      const snippet = stripHtml(rawBody);
      const detail = (data && data.error) || snippet || `HTTP ${res.status} ${res.statusText || ''}`.trim();
      throw new Error(`[${res.status}] ${detail}`);
    }
    if (data === null) {
      const snippet = stripHtml(rawBody) || '(empty body)';
      throw new Error(`[${res.status}] Server returned non-JSON: ${snippet}`);
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

  function stopVoicePick() {
    if (recog) recog.stop();
    els.voicePick.hidden = true;
  }

  function startVoicePick(choices, onPick) {
    if (!recog) return;
    els.voicePick.hidden = false;
    els.voicePickText.textContent = `Say one${choices.length >= 2 ? ', two' : ''}${choices.length >= 3 ? ', or three' : ''}…`;
    const numberWords = { one: 0, two: 1, three: 2, first: 0, second: 1, third: 2, '1': 0, '2': 1, '3': 2 };
    const tryStart = () => {
      recog.start({
        onResult: (transcript) => {
          const text = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
          let pickIndex = -1;
          for (const word of text.split(/\s+/)) {
            if (numberWords[word] != null && numberWords[word] < choices.length) {
              pickIndex = numberWords[word]; break;
            }
          }
          if (pickIndex === -1) {
            for (let i = 0; i < choices.length; i++) {
              const first = String(choices[i] || '').toLowerCase().split(/\s+/)[0] || '';
              if (first && text.includes(first)) { pickIndex = i; break; }
            }
          }
          if (pickIndex >= 0) {
            stopVoicePick();
            onPick(pickIndex);
          }
        },
        onError: (e) => {
          if (e && e.error === 'no-speech') return;
          stopVoicePick();
        },
        onEnd: () => {
          if (!els.voicePick.hidden) tryStart();
        },
      });
    };
    tryStart();
  }

  function renderPage(page) {
    state.currentPageNumber = page.pageNumber;
    state.pages[page.pageNumber - 1] = page;

    els.pageIndicator.textContent = `Page ${page.pageNumber} of ${state.totalPages}`;
    if (state.title) els.bookTitle.textContent = state.title;

    renderIllustration(page.imageDataUrl);
    stopVoicePick();
    clearKaraoke();

    els.bookText.classList.remove('is-visible');
    els.bookText.classList.add('is-fading');
    setTimeout(() => {
      renderTextWithSpans(els.bookText, page.text);
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
          tts.stop(); stopVoicePick(); clearKaraoke();
          turnPage(choiceText);
        });
        els.bookChoices.appendChild(btn);
      });

      if (tts.supported && !state.isMuted) {
        const intro = `What should happen next? `;
        const spoken = page.choices.map((c, i) => `Choice ${i + 1}: ${c}.`).join(' ');
        setTimeout(() => {
          tts.speak(intro + spoken, {
            onEnd: () => {
              if (recog) startVoicePick(page.choices, (idx) => {
                const text = page.choices[idx];
                if (!text) return;
                tts.stop(); clearKaraoke();
                turnPage(text);
              });
            },
          });
        }, 600);
      } else if (recog) {
        startVoicePick(page.choices, (idx) => {
          const text = page.choices[idx];
          if (!text) return;
          turnPage(text);
        });
      }
    } else {
      els.bookChoices.hidden = true;
      els.bookNav.hidden = false;
    }
  }

  function showEnd() {
    tts.stop(); stopVoicePick(); clearKaraoke();
    if (state.title) {
      els.endSubtitle.textContent = `You finished "${state.title}"!`;
    } else {
      els.endSubtitle.textContent = 'What a magical adventure!';
    }
    showScreen('end');
  }

  function readAboutForm() {
    return {
      hair: (els.aboutHair && els.aboutHair.value || '').trim(),
      favColour: (els.aboutFavColour && els.aboutFavColour.value || '').trim(),
      pet: (els.aboutPet && els.aboutPet.value || '').trim().slice(0, 40),
    };
  }

  function persistAbout(about) {
    try { localStorage.setItem(ABOUT_KEY, JSON.stringify(about)); } catch (_e) {}
  }
  function loadAbout() {
    try {
      const raw = localStorage.getItem(ABOUT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_e) { return null; }
  }
  function restoreAboutForm() {
    const a = loadAbout(); if (!a) return;
    if (els.aboutHair && a.hair) els.aboutHair.value = a.hair;
    if (els.aboutFavColour && a.favColour) els.aboutFavColour.value = a.favColour;
    if (els.aboutPet && a.pet) els.aboutPet.value = a.pet;
  }

  async function startBook() {
    if (state.isLoading) return;
    const topic = els.topicInput.value.trim() || 'a magical surprise adventure';
    const about = readAboutForm();
    persistAbout(about);

    tts.stop(); stopVoicePick(); clearKaraoke();
    state.bookId = null; state.title = ''; state.topic = topic; state.pages = []; state.currentPageNumber = 0;
    showScreen('book');
    els.bookTitle.textContent = 'Creating your story...';
    els.pageIndicator.textContent = `Page 1 of ${state.totalPages}`;
    els.bookText.textContent = '';
    els.bookNav.hidden = true;
    els.bookChoices.hidden = true;
    renderIllustration(null);
    setLoading(true, 'Lucy is sprinkling story magic...');

    try {
      const data = await callApi('/api/book/start', { topic, about });
      state.bookId = data.bookId;
      state.title = data.title || "Kaylee's Storybook";
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

  function rereadBook(book) {
    const pages = book ? book.pages : state.pages;
    if (!pages.length) return;
    tts.stop(); stopVoicePick(); clearKaraoke();
    state.pages = pages;
    state.title = book ? book.title : state.title;
    state.totalPages = pages.length;
    els.bookTitle.textContent = state.title || "Kaylee's Storybook";
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
        renderTextWithSpans(els.bookText, page.text);
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
      tts.stop(); stopVoicePick(); clearKaraoke();
      els.muteIcon.textContent = '🔇';
      els.muteLabel.textContent = 'Sound Off';
    } else {
      els.muteIcon.textContent = '🔊';
      els.muteLabel.textContent = 'Sound On';
    }
  }

  function loadLibrary() {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) { return []; }
  }
  function saveLibrary(list) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); }
    catch (err) { console.warn('Library save failed', err); }
  }
  function renderLibrary() {
    const list = loadLibrary();
    if (!list.length) { els.library.hidden = true; els.libraryShelf.innerHTML = ''; return; }
    els.library.hidden = false;
    els.libraryShelf.innerHTML = '';
    list.forEach((book) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'library-card';
      card.setAttribute('aria-label', `Reread ${book.title}`);
      const thumbSrc = (book.pages && book.pages[0] && book.pages[0].imageDataUrl) || '';
      if (thumbSrc) {
        const img = document.createElement('img');
        img.className = 'library-card__thumb';
        img.src = thumbSrc;
        img.alt = '';
        card.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'library-card__thumb';
        ph.style.display = 'flex'; ph.style.alignItems = 'center'; ph.style.justifyContent = 'center';
        ph.textContent = '✨';
        card.appendChild(ph);
      }
      const body = document.createElement('div');
      body.className = 'library-card__body';
      const title = document.createElement('span');
      title.className = 'library-card__title';
      title.textContent = book.title || 'Untitled story';
      const date = document.createElement('span');
      date.className = 'library-card__date';
      date.textContent = book.savedAt ? new Date(book.savedAt).toLocaleDateString() : '';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'library-card__remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        const fresh = loadLibrary().filter((b) => b.id !== book.id);
        saveLibrary(fresh);
        renderLibrary();
      });
      body.appendChild(title);
      body.appendChild(date);
      body.appendChild(remove);
      card.appendChild(body);
      card.addEventListener('click', () => rereadBook(book));
      els.libraryShelf.appendChild(card);
    });
  }

  function saveCurrentStory() {
    if (!state.pages.length) return false;
    const list = loadLibrary();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      title: state.title || "Kaylee's Storybook",
      topic: state.topic || '',
      savedAt: Date.now(),
      totalPages: state.totalPages,
      pages: state.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        imageDataUrl: p.imageDataUrl || null,
        isChoicePage: !!p.isChoicePage,
        choices: Array.isArray(p.choices) ? p.choices : [],
        isFinalPage: !!p.isFinalPage,
      })),
    };
    list.unshift(entry);
    while (list.length > 20) list.pop();
    saveLibrary(list);
    renderLibrary();
    return true;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
  function downloadKeepsake() {
    if (!state.pages.length) return;
    const title = state.title || "Kaylee's Storybook";
    const pagesHtml = state.pages.map((p) => `
      <article class="page">
        ${p.imageDataUrl ? `<img src="${escapeHtml(p.imageDataUrl)}" alt="" />` : ''}
        <p>${escapeHtml(p.text)}</p>
      </article>`).join('\n');
    const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, serif; background: #fff5fb; margin: 0; padding: 32px; color: #2d1f44; }
  h1 { text-align: center; color: #d63d8e; font-family: 'Trebuchet MS', sans-serif; }
  .page { background: #fffaf3; border: 4px solid #fff; border-radius: 18px; box-shadow: 0 8px 24px rgba(214, 61, 142, 0.18); padding: 22px; margin: 22px auto; max-width: 720px; page-break-after: always; }
  .page img { display: block; width: 100%; height: auto; border-radius: 12px; margin-bottom: 14px; }
  .page p { font-size: 1.15rem; line-height: 1.65; white-space: pre-wrap; }
  @media print { body { background: #fff; } .page { box-shadow: none; border: 1px solid #eee; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${pagesHtml}
</body></html>`;
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'storybook';
    a.download = `${safe}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  els.startBtn.addEventListener('click', startBook);
  els.nextBtn.addEventListener('click', () => { tts.stop(); clearKaraoke(); turnPage(null); });
  els.replayBtn.addEventListener('click', () => {
    const currentPage = state.pages[state.currentPageNumber - 1];
    if (currentPage) speakPageWithKaraoke(currentPage.text);
  });
  els.muteBtn.addEventListener('click', toggleMute);
  els.rereadBtn.addEventListener('click', () => rereadBook(null));
  els.saveBtn.addEventListener('click', () => {
    if (saveCurrentStory()) {
      els.saveBtn.disabled = true;
      if (els.saveBtnLabel) els.saveBtnLabel.textContent = 'Saved!';
    }
  });
  els.downloadBtn.addEventListener('click', downloadKeepsake);
  els.anotherBtn.addEventListener('click', () => {
    tts.stop(); stopVoicePick(); clearKaraoke();
    showScreen('cover');
    els.topicInput.value = '';
    els.topicChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-selected'));
    els.saveBtn.disabled = false;
    if (els.saveBtnLabel) els.saveBtnLabel.textContent = 'Save This Story';
    renderLibrary();
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

  if (recog) {
    els.topicMicBtn.hidden = false;
    let listening = false;
    els.topicMicBtn.addEventListener('click', () => {
      if (listening) { recog.stop(); listening = false; els.topicMicBtn.classList.remove('is-listening'); return; }
      listening = true;
      els.topicMicBtn.classList.add('is-listening');
      recog.start({
        onResult: (transcript) => {
          const cleaned = transcript.trim();
          if (!cleaned) return;
          const current = els.topicInput.value.trim().replace(/,\s*$/, '');
          els.topicInput.value = current ? current + ', ' + cleaned : cleaned;
          tidyTopicInput();
          syncChipStates();
        },
        onEnd: () => {
          listening = false;
          els.topicMicBtn.classList.remove('is-listening');
        },
        onError: () => {
          listening = false;
          els.topicMicBtn.classList.remove('is-listening');
        },
      });
    });
  }

  restoreAboutForm();
  renderLibrary();
})();
