/* ==========================================================================
   QUIZ MASTER PRO - CORE LOGIC ENGINE
   ========================================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Application State
let appData = {
    chapters: [],
    history: [],
    stats: { totalQuizzes: 0, totalCorrect: 0, totalQuestions: 0 }
};

let currentQuiz = null;
let currentQuizChId = null;
let timerInterval = null;

// ==================== STORAGE ENGINE ====================
function loadState() {
    const saved = localStorage.getItem('QuizMasterPro_DB');
    if (saved) {
        try {
            appData = JSON.parse(saved);
        } catch (e) {
            console.error('Data corrupted, reset');
        }
    }
    updateUIOverview();
}

function saveState() {
    localStorage.setItem('QuizMasterPro_DB', JSON.stringify(appData));
    updateUIOverview();
}

// ==================== SCREEN SWITCHING ====================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${screenId}-screen`);
    if (target) target.classList.add('active');

    // Bottom nav visibility
    const bNav = document.getElementById('bottom-nav');
    if (screenId === 'quiz' || screenId === 'loading') {
        bNav.style.display = 'none';
    } else {
        bNav.style.display = 'flex';
    }
}

function switchNav(screenName) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.screen === screenName);
    });
    showScreen(screenName);
}

// ==================== UI OVERVIEWS ====================
function updateUIOverview() {
    const totalQ = appData.chapters.reduce((sum, c) => sum + c.questions.length, 0);
    
    // Quick hero stats
    document.getElementById('quick-ch-count').textContent = appData.chapters.length;
    document.getElementById('quick-q-count').textContent = totalQ;
    document.getElementById('chapter-total-badge').textContent = `${appData.chapters.length} Chapters`;

    renderRecentList();
    renderChaptersGrid();
    renderAnalyticsView();
}

function renderRecentList() {
    const container = document.getElementById('home-recent-list');
    if (!appData.chapters.length) {
        container.innerHTML = `<p style="color:var(--text-low);font-size:0.8rem;text-align:center;padding:20px;">Koi chapter nahi hai. "+" button se naya quiz dalein.</p>`;
        return;
    }
    const recents = [...appData.chapters].reverse().slice(0, 3);
    container.innerHTML = recents.map(ch => `
        <div class="ch-item-card" onclick="openQuizSetup('${ch.id}')">
            <div class="ch-left">
                <div class="ch-icon-pill">📖</div>
                <div class="ch-details">
                    <h4>${escapeHTML(ch.name)}</h4>
                    <div class="ch-meta">
                        <span>📝 ${ch.questions.length} Qs</span>
                        <span>🏆 ${ch.bestScore !== undefined ? ch.bestScore + '%' : 'Unplayed'}</span>
                    </div>
                </div>
            </div>
            <span style="color:var(--primary-light)">▶</span>
        </div>
    `).join('');
}

function renderChaptersGrid(filter = '') {
    const container = document.getElementById('chapters-list');
    let list = appData.chapters;
    if (filter) {
        list = list.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    }
    if (!list.length) {
        container.innerHTML = `<p style="color:var(--text-low);font-size:0.85rem;text-align:center;padding:30px;">Koi chapter match nahi hua.</p>`;
        return;
    }
    container.innerHTML = list.map((ch, idx) => `
        <div class="ch-item-card" onclick="openQuizSetup('${ch.id}')">
            <div class="ch-left">
                <div class="ch-icon-pill">📖</div>
                <div class="ch-details">
                    <h4>${escapeHTML(ch.name)}</h4>
                    <div class="ch-meta">
                        <span>📝 ${ch.questions.length} Questions</span>
                        <span>🏆 Best: ${ch.bestScore !== undefined ? ch.bestScore + '%' : '-'}</span>
                    </div>
                </div>
            </div>
            <div class="ch-actions">
                <button class="btn-icon-ghost" onclick="event.stopPropagation();deleteChapter('${ch.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function filterChapters(val) {
    renderChaptersGrid(val);
}

function deleteChapter(id) {
    if (confirm('Kya aap sach me is chapter ko delete karna chahte hain?')) {
        appData.chapters = appData.chapters.filter(c => c.id !== id);
        saveState();
    }
}

// ==================== UNIVERSAL PARSER (TEXT, WORD, PDF) ====================
function parseUniversalQuizText(text) {
    const questions = [];
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split questions by (Q1, 1., 1), प्रश्न 1, etc.)
    const questionBlocks = text.split(/(?:^|\n)\s*(?:Q\.?\s*|Question\s*|प्रश्न\s*)?(\d+)[\.\)\:\-]\s*/gi);

    for (let i = 1; i < questionBlocks.length; i += 2) {
        const qNum = questionBlocks[i];
        const content = questionBlocks[i + 1];
        if (!content) continue;

        // Match options A), B), C), D) / (A), (B) / 1), 2)
        const optMatches = [...content.matchAll(/(?:^|\n|\s)\s*\(?([A-Da-d1-4])\)?[\.\)\:\-]\s*([^\n\r]+)/g)];

        if (optMatches.length >= 2) {
            const firstOptIdx = optMatches[0].index;
            let qText = content.substring(0, firstOptIdx).trim();
            if (!qText) qText = `Question ${qNum}`;

            const options = optMatches.slice(0, 4).map(m => {
                let lbl = m[1].toUpperCase();
                if (lbl === '1') lbl = 'A';
                if (lbl === '2') lbl = 'B';
                if (lbl === '3') lbl = 'C';
                if (lbl === '4') lbl = 'D';
                return { label: lbl, text: m[2].trim() };
            });

            // Extract Answer
            let answer = '';
            const ansM = content.match(/(?:Answer|Ans|Correct|उत्तर)[\s\.\:\-]*\(?([A-Da-d1-4])/i);
            if (ansM) {
                answer = ansM[1].toUpperCase();
                if (answer === '1') answer = 'A';
                if (answer === '2') answer = 'B';
                if (answer === '3') answer = 'C';
                if (answer === '4') answer = 'D';
            }

            // Extract Explanation
            let exp = '';
            const expM = content.match(/(?:Explanation|Exp|व्याख्या|Solution|Sol)[\s\.\:\-]*([^\n\r]+(?:\n[^\n\r]+)*)/i);
            if (expM) exp = expM[1].trim();

            questions.push({ id: qNum, question: qText, options: options, answer: answer, explanation: exp });
        }
    }
    return questions;
}

// ==================== MODAL SUBMISSION HANDLERS ====================
function openAddModal() {
    document.getElementById('add-ch-name').value = '';
    document.getElementById('paste-text-input').value = '';
    document.getElementById('add-modal').classList.add('active');
}

function closeAddModal() {
    document.getElementById('add-modal').classList.remove('active');
}

function setAddTab(tabName) {
    document.querySelectorAll('.tab-toggle-pill .pill-btn').forEach((b, i) => {
        b.classList.toggle('active', (tabName === 'text' && i === 0) || (tabName === 'word' && i === 1) || (tabName === 'pdf' && i === 2));
    });
    document.getElementById('tab-text').classList.toggle('active', tabName === 'text');
    document.getElementById('tab-word').classList.toggle('active', tabName === 'word');
    document.getElementById('tab-pdf').classList.toggle('active', tabName === 'pdf');
}

function updateFileLabel(input, labelId) {
    if (input.files && input.files[0]) {
        document.getElementById(labelId).textContent = `✅ Selected: ${input.files[0].name}`;
    }
}

// 1. Text Paste
function processTextSubmit() {
    const name = document.getElementById('add-ch-name').value.trim() || 'New Chapter';
    const text = document.getElementById('paste-text-input').value.trim();
    if (!text) { alert('Kripya text paste karein!'); return; }

    const questions = parseUniversalQuizText(text);
    if (!questions.length) {
        alert('Questions detect nahi ho sake! Format check karein:\n\nQ1. Bharat ki rajdhani?\nA) Mumbai\nB) Delhi\nAnswer: B');
        return;
    }
    createNewChapter(name, questions);
}

// 2. Word File (.docx)
async function processWordSubmit() {
    const name = document.getElementById('add-ch-name').value.trim() || 'Word Chapter';
    const file = document.getElementById('word-file-input').files[0];
    if (!file) { alert('Pehle Word (.docx) file select karein!'); return; }

    closeAddModal();
    showScreen('loading');
    document.getElementById('loading-text').textContent = 'Word file process ho rahi hai...';

    try {
        const buffer = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buffer });
        const questions = parseUniversalQuizText(res.value);
        if (!questions.length) {
            alert('Questions nahi mile! "Text Paste" option use karein.');
            showScreen('home');
            return;
        }
        createNewChapter(name, questions);
    } catch (e) {
        alert('Word file error: ' + e.message);
        showScreen('home');
    }
}

// 3. PDF File
async function processPdfSubmit() {
    const name = document.getElementById('add-ch-name').value.trim() || 'PDF Chapter';
    const file = document.getElementById('pdf-file-input').files[0];
    if (!file) { alert('Pehle PDF file select karein!'); return; }

    closeAddModal();
    showScreen('loading');
    document.getElementById('loading-text').textContent = 'PDF scan ho rahi hai...';

    try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(x => x.str).join(' ') + '\n';
        }
        const questions = parseUniversalQuizText(fullText);
        if (!questions.length) {
            alert('PDF se text extract nahi hua! Kripya copy karke "Text Paste" karein.');
            showScreen('home');
            return;
        }
        createNewChapter(name, questions);
    } catch (e) {
        alert('PDF error: ' + e.message);
        showScreen('home');
    }
}

function createNewChapter(name, questions) {
    appData.chapters.push({
        id: 'ch_' + Date.now(),
        name: name,
        questions: questions
    });
    saveState();
    closeAddModal();
    switchNav('chapters');
    alert(`🎉 Success! "${name}" add ho gaya (${questions.length} Questions).`);
}

// ==================== QUIZ CONFIG & ENGINE ====================
function openQuizSetup(chId) {
    currentQuizChId = chId;
    let total = 0;
    let title = '';

    if (chId === 'combined') {
        total = appData.chapters.reduce((sum, c) => sum + c.questions.length, 0);
        title = '🔀 Mega Combined Quiz';
    } else {
        const ch = appData.chapters.find(c => c.id === chId);
        if (!ch) return;
        total = ch.questions.length;
        title = ch.name;
    }

    if (total === 0) {
        alert('Koi question uplabdh nahi hai.');
        return;
    }

    document.getElementById('setup-target-title').textContent = title;
    document.getElementById('setup-target-meta').textContent = `Total Available: ${total} Questions`;
    
    const startIn = document.getElementById('setup-start-num');
    const countIn = document.getElementById('setup-count-num');
    startIn.max = total;
    startIn.value = 1;
    countIn.max = total;
    countIn.value = total;

    document.getElementById('setup-modal').classList.add('active');
}

function closeSetupModal() {
    document.getElementById('setup-modal').classList.remove('active');
}

function launchQuizEngine() {
    let allQuestions = [];
    if (currentQuizChId === 'combined') {
        appData.chapters.forEach(c => c.questions.forEach(q => allQuestions.push({ ...q, chName: c.name })));
    } else {
        const ch = appData.chapters.find(c => c.id === currentQuizChId);
        allQuestions = [...ch.questions];
    }

    let start = parseInt(document.getElementById('setup-start-num').value) || 1;
    let count = parseInt(document.getElementById('setup-count-num').value) || allQuestions.length;
    const shuffle = document.getElementById('setup-shuffle-toggle').checked;

    closeSetupModal();

    // Slice question pool
    let selected = allQuestions.slice(start - 1, start - 1 + count);

    // Shuffle if enabled
    if (shuffle) {
        for (let i = selected.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [selected[i], selected[j]] = [selected[j], selected[i]];
        }
    }

    currentQuiz = {
        questions: selected,
        index: 0,
        score: 0,
        wrong: 0,
        startTime: Date.now()
    };

    const chapterTitle = currentQuizChId === 'combined' ? 'Combined Quiz' : appData.chapters.find(c => c.id === currentQuizChId).name;
    document.getElementById('quiz-chapter-tag').textContent = chapterTitle;

    showScreen('quiz');
    startTimer();
    renderQuizQuestion();
}

// ==================== QUIZ ACTIVE INTERACTION ====================
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - currentQuiz.startTime) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        document.getElementById('quiz-timer').textContent = `⏱ ${m}:${s}`;
    }, 1000);
}

function renderQuizQuestion() {
    const q = currentQuiz.questions[currentQuiz.index];
    const total = currentQuiz.questions.length;

    document.getElementById('q-number-tag').textContent = `QUESTION ${currentQuiz.index + 1} OF ${total}`;
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('q-counter-badge').textContent = `Q ${currentQuiz.index + 1}/${total}`;
    document.getElementById('quiz-score-c').textContent = currentQuiz.score;
    document.getElementById('quiz-score-w').textContent = currentQuiz.wrong;

    // Progress
    const pct = ((currentQuiz.index + 1) / total) * 100;
    document.getElementById('progress-bar-fill').style.width = `${pct}%`;

    // Hide Next / Finish & Explanation
    document.getElementById('explanation-box').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('finish-btn').classList.add('hidden');

    // Render Options
    const optBox = document.getElementById('options-container');
    optBox.innerHTML = q.options.map(opt => `
        <button class="option-card" onclick="handleOptionSelect('${opt.label}', this)">
            <span class="opt-prefix">${opt.label}</span>
            <span class="opt-text">${escapeHTML(opt.text)}</span>
        </button>
    `).join('');
}

function handleOptionSelect(selectedLabel, btnElement) {
    const q = currentQuiz.questions[currentQuiz.index];
    const allBtns = document.querySelectorAll('.option-card');
    allBtns.forEach(b => b.classList.add('locked'));

    // Haptic feedback (if available)
    if (navigator.vibrate) navigator.vibrate(selectedLabel === q.answer ? 30 : [40, 40, 40]);

    if (selectedLabel === q.answer) {
        btnElement.classList.add('correct');
        currentQuiz.score++;
    } else {
        btnElement.classList.add('wrong');
        currentQuiz.wrong++;
        // Highlight the correct one
        allBtns.forEach(b => {
            if (b.querySelector('.opt-prefix').textContent === q.answer) {
                b.classList.add('correct');
            }
        });
    }

    // Explanation
    if (q.explanation) {
        document.getElementById('explanation-text').textContent = q.explanation;
        document.getElementById('explanation-box').classList.remove('hidden');
    }

    // Nav Button Show
    if (currentQuiz.index < currentQuiz.questions.length - 1) {
        document.getElementById('next-btn').classList.remove('hidden');
    } else {
        document.getElementById('finish-btn').classList.remove('hidden');
    }
}

function nextQuestion() {
    currentQuiz.index++;
    renderQuizQuestion();
}

function quitQuiz() {
    if (confirm('Kya aap quiz chhod kar bahar aana chahte hain?')) {
        clearInterval(timerInterval);
        showScreen('home');
    }
}

function finishQuiz() {
    clearInterval(timerInterval);
    const total = currentQuiz.questions.length;
    const accuracy = Math.round((currentQuiz.score / total) * 100);
    const timeStr = document.getElementById('quiz-timer').textContent.replace('⏱ ', '');

    // Best score update
    if (currentQuizChId !== 'combined') {
        const ch = appData.chapters.find(c => c.id === currentQuizChId);
        if (ch && (ch.bestScore === undefined || accuracy > ch.bestScore)) {
            ch.bestScore = accuracy;
        }
    }

    // Update Global Stats & History
    appData.stats.totalQuizzes++;
    appData.stats.totalCorrect += currentQuiz.score;
    appData.stats.totalQuestions += total;

    appData.history.unshift({
        id: Date.now(),
        title: currentQuizChId === 'combined' ? 'Combined Test' : appData.chapters.find(c => c.id === currentQuizChId).name,
        score: currentQuiz.score,
        total: total,
        accuracy: accuracy,
        time: timeStr,
        date: new Date().toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })
    });

    saveState();

    // Result Presentation
    document.getElementById('res-emoji').textContent = accuracy >= 80 ? '🏆' : accuracy >= 50 ? '👏' : '📚';
    document.getElementById('res-title').textContent = accuracy >= 80 ? 'Outstanding Performance!' : accuracy >= 50 ? 'Good Effort!' : 'Keep Practicing!';
    document.getElementById('res-percentage').textContent = `${accuracy}%`;
    document.getElementById('res-correct').textContent = currentQuiz.score;
    document.getElementById('res-wrong').textContent = currentQuiz.wrong;
    document.getElementById('res-total').textContent = total;
    document.getElementById('res-time').textContent = timeStr;

    // Animate Circle
    const circle = document.getElementById('ring-progress');
    const circumference = 314.159;
    circle.style.strokeDashoffset = circumference - (accuracy / 100) * circumference;

    showScreen('result');
}

// ==================== ANALYTICS VIEW ====================
function renderAnalyticsView() {
    document.getElementById('an-total-quizzes').textContent = appData.stats.totalQuizzes;
    const avg = appData.stats.totalQuestions ? Math.round((appData.stats.totalCorrect / appData.stats.totalQuestions) * 100) : 0;
    document.getElementById('an-avg-accuracy').textContent = `${avg}%`;

    const container = document.getElementById('history-container');
    if (!appData.history.length) {
        container.innerHTML = `<p style="color:var(--text-low);font-size:0.8rem;text-align:center;padding:20px;">Abhi tak koi quiz record nahi hua.</p>`;
        return;
    }
    container.innerHTML = appData.history.map(h => `
        <div class="history-item">
            <div class="hi-left">
                <h5>${escapeHTML(h.title)}</h5>
                <p>${h.date} • Duration: ${h.time}</p>
            </div>
            <div class="hi-right">
                <div class="hi-score ${h.accuracy >= 70 ? 'text-green' : h.accuracy >= 40 ? 'text-amber' : 'text-red'}">${h.accuracy}%</div>
                <small style="color:var(--text-low);font-size:0.7rem">${h.score}/${h.total} Correct</small>
            </div>
        </div>
    `).join('');
}

function clearStatsData() {
    if (confirm('Kya aap sari history aur stats clear karna chahte hain?')) {
        appData.history = [];
        appData.stats = { totalQuizzes: 0, totalCorrect: 0, totalQuestions: 0 };
        saveState();
    }
}

// Utilities
function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

// Startup
window.onload = loadState;
