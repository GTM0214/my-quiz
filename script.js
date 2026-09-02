/* ==========================================================================
   QUIZ MASTER PRO - 100% WORKING GEMINI 1.5 FLASH ENGINE
   ========================================================================== */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let appData = {
    chapters: [],
    history: [],
    stats: { totalQuizzes: 0, totalCorrect: 0, totalQuestions: 0 }
};

let currentQuiz = null;
let currentQuizChId = null;
let timerInterval = null;
let selectedBase64Images = [];

// ==================== INITIALIZATION ====================
function loadState() {
    const saved = localStorage.getItem('QuizMasterPro_DB');
    if (saved) {
        try { appData = JSON.parse(saved); } catch (e) {}
    }
    updateApiKeyStatus();
    updateUIOverview();
}

function saveState() {
    localStorage.setItem('QuizMasterPro_DB', JSON.stringify(appData));
    updateUIOverview();
}

// ==================== API KEY MANAGEMENT & LIVE TESTER ====================
function getApiKey() {
    return (localStorage.getItem('GEMINI_API_KEY') || '').trim();
}

function saveApiKey() {
    const key = document.getElementById('gemini-api-key-input').value.trim();
    if (!key) { alert('Kripya valid API key enter karein!'); return; }
    localStorage.setItem('GEMINI_API_KEY', key);
    closeKeyModal();
    updateApiKeyStatus();
    alert('✅ API Key successfully save ho gayi! Ab "Test Key" karke check karein.');
}

async function testApiKeyLive() {
    const key = (document.getElementById('gemini-api-key-input').value || getApiKey()).trim();
    if (!key) {
        alert('Pehle API Key box me paste karein!');
        return;
    }

    const testBtn = document.getElementById('test-key-btn');
    if (testBtn) testBtn.textContent = '⏳ Testing...';

    try {
        // Calling Gemini 1.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "Hello" }] }]
            })
        });

        const data = await res.json();
        if (res.ok && data.candidates) {
            alert('🎉 SUCCESS! Aapka gemini-1.5-flash model 100% active aur ready hai!');
            localStorage.setItem('GEMINI_API_KEY', key);
            updateApiKeyStatus();
        } else {
            const errDetails = data.error?.message || JSON.stringify(data);
            alert('❌ Key Test Failed!\n\nGoogle Error: ' + errDetails + '\n\nTip: aistudio.google.com/app/apikey se nayi key banayein.');
        }
    } catch (e) {
        alert('❌ Network Error: ' + e.message);
    } finally {
        if (testBtn) testBtn.textContent = '🔍 Test Key';
    }
}

function updateApiKeyStatus() {
    const key = getApiKey();
    const btn = document.getElementById('key-status-btn');
    const txt = document.getElementById('key-btn-txt');
    if (key) {
        btn.classList.add('active-key');
        txt.textContent = 'AI Key: Active';
    } else {
        btn.classList.remove('active-key');
        txt.textContent = 'Set AI Key';
    }
}

function openKeyModal() {
    document.getElementById('gemini-api-key-input').value = getApiKey();
    document.getElementById('key-modal').classList.add('active');
}

function closeKeyModal() {
    document.getElementById('key-modal').classList.remove('active');
}

// ==================== NAVIGATION ====================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`${screenId}-screen`);
    if (target) target.classList.add('active');

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

// ==================== UI OVERVIEW & CHAPTER RENDERING ====================
function updateUIOverview() {
    const totalQ = appData.chapters.reduce((sum, c) => sum + c.questions.length, 0);
    document.getElementById('quick-ch-count').textContent = appData.chapters.length;
    document.getElementById('quick-q-count').textContent = totalQ;
    document.getElementById('chapter-total-badge').textContent = `${appData.chapters.length} Chapters`;

    renderRecentList();
    renderChaptersGrid();
    renderAnalyticsView();
    populateChapterDropdowns();
}

function renderRecentList() {
    const container = document.getElementById('home-recent-list');
    if (!appData.chapters.length) {
        container.innerHTML = `<p style="color:var(--text-low);font-size:0.8rem;text-align:center;padding:20px;">Koi chapter nahi hai. "📸" button se photo scan karein.</p>`;
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
        container.innerHTML = `<p style="color:var(--text-low);font-size:0.85rem;text-align:center;padding:30px;">Koi chapter nahi mila.</p>`;
        return;
    }
    container.innerHTML = list.map(ch => `
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
                <button class="btn-add-page-chip" onclick="event.stopPropagation();quickAddMorePages('${ch.id}')" title="Is chapter me aur page jodo">
                    ➕ Add Page
                </button>
                <button class="btn-icon-ghost" onclick="event.stopPropagation();deleteChapter('${ch.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function filterChapters(val) { renderChaptersGrid(val); }

function deleteChapter(id) {
    if (confirm('Kya aap is chapter ko delete karna chahte hain?')) {
        appData.chapters = appData.chapters.filter(c => c.id !== id);
        saveState();
    }
}

function populateChapterDropdowns() {
    const aiSelect = document.getElementById('ai-existing-ch-select');
    const manualSelect = document.getElementById('manual-existing-ch-select');
    
    if (!appData.chapters.length) {
        const emptyOpt = `<option value="">Koi purana chapter nahi hai</option>`;
        aiSelect.innerHTML = emptyOpt;
        manualSelect.innerHTML = emptyOpt;
        return;
    }

    const optionsHTML = appData.chapters.map(ch => `
        <option value="${ch.id}">${escapeHTML(ch.name)} (${ch.questions.length} Qs)</option>
    `).join('');

    aiSelect.innerHTML = optionsHTML;
    manualSelect.innerHTML = optionsHTML;
}

function quickAddMorePages(chapterId) {
    openCameraModal();
    setChapterTargetMode('existing');
    document.getElementById('ai-existing-ch-select').value = chapterId;
}

// ==================== 📸 AUTO COMPRESS & PREVIEW ====================
function openCameraModal() {
    selectedBase64Images = [];
    document.getElementById('ai-ch-name').value = '';
    document.getElementById('multi-preview-container').innerHTML = '';
    document.getElementById('multi-preview-container').classList.add('hidden');
    document.getElementById('camera-file-label').textContent = 'Aap ek saath 1 ya zyada photos select kar sakte hain';
    setChapterTargetMode('new');
    document.getElementById('camera-modal').classList.add('active');
}

function closeCameraModal() {
    document.getElementById('camera-modal').classList.remove('active');
}

function setChapterTargetMode(mode) {
    const isExisting = (mode === 'existing');
    document.getElementById('pill-mode-new').classList.toggle('active', !isExisting);
    document.getElementById('pill-mode-existing').classList.toggle('active', isExisting);
    document.getElementById('group-new-ch').classList.toggle('hidden', isExisting);
    document.getElementById('group-existing-ch').classList.toggle('hidden', !isExisting);
}

// Compresses camera image for ultra fast upload
function compressImage(file, maxWidth = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

async function handleMultiImageSelect(input) {
    if (input.files && input.files.length > 0) {
        selectedBase64Images = [];
        const container = document.getElementById('multi-preview-container');
        container.innerHTML = '';
        container.classList.remove('hidden');
        
        document.getElementById('camera-file-label').textContent = `⏳ Compressing ${input.files.length} Photo(s)...`;

        for (let idx = 0; idx < input.files.length; idx++) {
            const file = input.files[idx];
            try {
                const compressedDataUrl = await compressImage(file);
                const b64 = compressedDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
                selectedBase64Images.push(b64);

                const thumb = document.createElement('div');
                thumb.className = 'preview-thumb';
                thumb.innerHTML = `
                    <img src="${compressedDataUrl}" alt="Page ${idx + 1}">
                    <span class="page-tag">Page ${idx + 1}</span>
                `;
                container.appendChild(thumb);
            } catch (err) {
                console.error("Compression error on image " + idx, err);
            }
        }
        document.getElementById('camera-file-label').textContent = `✅ ${selectedBase64Images.length} Photo(s) Ready!`;
    }
}

// ==================== 🤖 GEMINI AI PARSER ====================
async function processAiPhotoSubmit() {
    const apiKey = getApiKey();
    if (!apiKey) {
        alert('Pehle apni Free Google AI Key set karein!\n(Upar "Set AI Key" button par click karein)');
        openKeyModal();
        return;
    }

    if (!selectedBase64Images.length) {
        alert('Kripya pehle 1 ya zyada photos select karein!');
        return;
    }

    const isExisting = document.getElementById('pill-mode-existing').classList.contains('active');
    let targetChapterId = null;
    let chapterName = '';

    if (isExisting) {
        targetChapterId = document.getElementById('ai-existing-ch-select').value;
        if (!targetChapterId) { alert('Kripya ek valid chapter chunein!'); return; }
        chapterName = appData.chapters.find(c => c.id === targetChapterId).name;
    } else {
        chapterName = document.getElementById('ai-ch-name').value.trim() || `Hindi Chapter ${appData.chapters.length + 1}`;
    }

    closeCameraModal();
    showScreen('loading');

    const totalPages = selectedBase64Images.length;
    let allExtractedQuestions = [];

    for (let i = 0; i < totalPages; i++) {
        document.getElementById('loading-text').textContent = `Page ${i + 1} of ${totalPages} scan ho raha hai...`;
        document.getElementById('loading-subtext').textContent = 'AI Hindi Devanagari questions decode kar raha hai...';

        try {
            const pageQuestions = await extractQuestionsFromSingleImage(selectedBase64Images[i], apiKey);
            if (Array.isArray(pageQuestions) && pageQuestions.length > 0) {
                allExtractedQuestions = allExtractedQuestions.concat(pageQuestions);
            }
        } catch (err) {
            console.error(`Page ${i + 1} extraction error:`, err);
            alert(`⚠️ Page ${i + 1} Scan Issue:\n` + err.message);
        }
    }

    if (allExtractedQuestions.length === 0) {
        alert('❌ Photo se questions extract nahi ho sake!\n\nCheck karein:\n1. Key valid hai ya nahi (Set AI Key -> Test Key daba ke dekhein)\n2. Photo me sawal aur 4 options saaf dikh rahe hon.');
        showScreen('home');
        return;
    }

    saveOrAppendQuestions(targetChapterId, chapterName, allExtractedQuestions);
}

// Single Image AI Caller (Gemini 1.5 Flash)
async function extractQuestionsFromSingleImage(base64Data, apiKey) {
    const prompt = `
Extract all multiple-choice questions (MCQs) from this image.
The text may be in Hindi (Devanagari script), English, or bilingual.

Strict Rules:
1. Extract EVERY question, options (A, B, C, D), the correct answer, and an explanation.
2. If options are (क, ख, ग, घ), (अ, ब, स, द), or (1, 2, 3, 4), map them to (A, B, C, D).
3. If the answer is not written on the page, logically solve and select the correct option.
4. Output MUST be ONLY a JSON array. Do NOT wrap in markdown \`\`\`json. Do not write any conversational text.

Format:
[
  {
    "id": 1,
    "question": "प्रश्न यहाँ लिखें",
    "options": [
      {"label": "A", "text": "पहला विकल्प"},
      {"label": "B", "text": "दूसरा विकल्प"},
      {"label": "C", "text": "तीसरा विकल्प"},
      {"label": "D", "text": "चौथा विकल्प"}
    ],
    "answer": "A",
    "explanation": "व्याख्या यहाँ लिखें"
  }
]
`;

    const requestBody = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: base64Data
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            topP: 0.95
        }
    };

    // Explicit gemini-1.5-flash endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${response.status} Error`;
        throw new Error(errMsg);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error("AI ne koi content generate nahi kiya. Kripya photo check karein.");
    }

    let textResponse = data.candidates[0].content.parts[0].text.trim();

    // Regex extraction to safely grab the JSON Array
    const jsonMatch = textResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
        throw new Error("AI output me valid JSON question format nahi mila: " + textResponse.substring(0, 100));
    }

    return JSON.parse(jsonMatch[0]);
}

// ==================== MANUAL ADD HANDLERS ====================
function openAddModal() {
    document.getElementById('add-ch-name').value = '';
    document.getElementById('paste-text-input').value = '';
    setManualTargetMode('new');
    document.getElementById('add-modal').classList.add('active');
}

function closeAddModal() { document.getElementById('add-modal').classList.remove('active'); }

function setManualTargetMode(mode) {
    const isExisting = (mode === 'existing');
    document.getElementById('pill-manual-new').classList.toggle('active', !isExisting);
    document.getElementById('pill-manual-existing').classList.toggle('active', isExisting);
    document.getElementById('group-manual-new').classList.toggle('hidden', isExisting);
    document.getElementById('group-manual-existing').classList.toggle('hidden', !isExisting);
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

function parseUniversalQuizText(text) {
    const questions = [];
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const questionBlocks = text.split(/(?:^|\n)\s*(?:Q\.?\s*|Question\s*|प्रश्न\s*)?(\d+)[\.\)\:\-]\s*/gi);

    for (let i = 1; i < questionBlocks.length; i += 2) {
        const qNum = questionBlocks[i];
        const content = questionBlocks[i + 1];
        if (!content) continue;

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

            let answer = '';
            const ansM = content.match(/(?:Answer|Ans|Correct|उत्तर)[\s\.\:\-]*\(?([A-Da-d1-4])/i);
            if (ansM) {
                answer = ansM[1].toUpperCase();
                if (answer === '1') answer = 'A';
                if (answer === '2') answer = 'B';
                if (answer === '3') answer = 'C';
                if (answer === '4') answer = 'D';
            }

            let exp = '';
            const expM = content.match(/(?:Explanation|Exp|व्याख्या|Solution|Sol)[\s\.\:\-]*([^\n\r]+(?:\n[^\n\r]+)*)/i);
            if (expM) exp = expM[1].trim();

            questions.push({ id: qNum, question: qText, options: options, answer: answer, explanation: exp });
        }
    }
    return questions;
}

function processTextSubmit() {
    const isExisting = document.getElementById('pill-manual-existing').classList.contains('active');
    let targetId = null;
    let name = '';

    if (isExisting) {
        targetId = document.getElementById('manual-existing-ch-select').value;
        name = appData.chapters.find(c => c.id === targetId).name;
    } else {
        name = document.getElementById('add-ch-name').value.trim() || 'New Chapter';
    }

    const text = document.getElementById('paste-text-input').value.trim();
    if (!text) { alert('Kripya text paste karein!'); return; }

    const questions = parseUniversalQuizText(text);
    if (!questions.length) { alert('Questions detect nahi huye. Format check karein.'); return; }

    saveOrAppendQuestions(targetId, name, questions);
}

async function processWordSubmit() {
    const isExisting = document.getElementById('pill-manual-existing').classList.contains('active');
    let targetId = isExisting ? document.getElementById('manual-existing-ch-select').value : null;
    let name = isExisting ? appData.chapters.find(c => c.id === targetId).name : (document.getElementById('add-ch-name').value.trim() || 'Word Chapter');

    const file = document.getElementById('word-file-input').files[0];
    if (!file) { alert('Word file select karein!'); return; }
    closeAddModal();
    showScreen('loading');
    try {
        const buffer = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buffer });
        const questions = parseUniversalQuizText(res.value);
        saveOrAppendQuestions(targetId, name, questions);
    } catch (e) { alert('Error: ' + e.message); showScreen('home'); }
}

async function processPdfSubmit() {
    const isExisting = document.getElementById('pill-manual-existing').classList.contains('active');
    let targetId = isExisting ? document.getElementById('manual-existing-ch-select').value : null;
    let name = isExisting ? appData.chapters.find(c => c.id === targetId).name : (document.getElementById('add-ch-name').value.trim() || 'PDF Chapter');

    const file = document.getElementById('pdf-file-input').files[0];
    if (!file) { alert('PDF file select karein!'); return; }
    closeAddModal();
    showScreen('loading');
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
        saveOrAppendQuestions(targetId, name, questions);
    } catch (e) { alert('Error: ' + e.message); showScreen('home'); }
}

// ==================== CORE SAVE / APPEND ====================
function saveOrAppendQuestions(targetChapterId, chapterName, newQuestions) {
    if (targetChapterId) {
        const chapter = appData.chapters.find(c => c.id === targetChapterId);
        if (chapter) {
            const existingCount = chapter.questions.length;
            const formattedNewQuestions = newQuestions.map((q, idx) => ({
                ...q,
                id: existingCount + idx + 1
            }));
            chapter.questions = chapter.questions.concat(formattedNewQuestions);
            saveState();
            closeAddModal();
            closeCameraModal();
            switchNav('chapters');
            alert(`✅ Success! "${chapter.name}" me ${formattedNewQuestions.length} naye questions jud gaye!\n(Total Ab: ${chapter.questions.length} Questions)`);
            return;
        }
    }

    const formattedQuestions = newQuestions.map((q, idx) => ({ ...q, id: idx + 1 }));
    appData.chapters.push({
        id: 'ch_' + Date.now(),
        name: chapterName,
        questions: formattedQuestions
    });
    saveState();
    closeAddModal();
    closeCameraModal();
    switchNav('chapters');
    alert(`🎉 Success! Naya Chapter "${chapterName}" ban gaya jisme ${formattedQuestions.length} questions hain.`);
}

// ==================== QUIZ SETUP & LAUNCH ====================
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

    if (total === 0) { alert('Koi question uplabdh nahi hai.'); return; }

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

function closeSetupModal() { document.getElementById('setup-modal').classList.remove('active'); }

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

    let selected = allQuestions.slice(start - 1, start - 1 + count);

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

// ==================== ACTIVE QUIZ ====================
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

    const pct = ((currentQuiz.index + 1) / total) * 100;
    document.getElementById('progress-bar-fill').style.width = `${pct}%`;

    document.getElementById('explanation-box').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('finish-btn').classList.add('hidden');

    const optBox = document.getElementById('options-container');
    optBox.innerHTML = q.options.map(opt => `
        <button class="option-card" onclick="handleOptionSelect('${opt.label}', this)">
            <span class="opt-prefix">${opt.label}</span>
            <span class="opt-text hindi-font">${escapeHTML(opt.text)}</span>
        </button>
    `).join('');
}

function handleOptionSelect(selectedLabel, btnElement) {
    const q = currentQuiz.questions[currentQuiz.index];
    const allBtns = document.querySelectorAll('.option-card');
    allBtns.forEach(b => b.classList.add('locked'));

    if (navigator.vibrate) navigator.vibrate(selectedLabel === q.answer ? 30 : [40, 40, 40]);

    if (selectedLabel === q.answer) {
        btnElement.classList.add('correct');
        currentQuiz.score++;
    } else {
        btnElement.classList.add('wrong');
        currentQuiz.wrong++;
        allBtns.forEach(b => {
            if (b.querySelector('.opt-prefix').textContent === q.answer) {
                b.classList.add('correct');
            }
        });
    }

    if (q.explanation) {
        document.getElementById('explanation-text').textContent = q.explanation;
        document.getElementById('explanation-box').classList.remove('hidden');
    }

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
    if (confirm('Kya aap quiz chhodna chahte hain?')) {
        clearInterval(timerInterval);
        showScreen('home');
    }
}

function finishQuiz() {
    clearInterval(timerInterval);
    const total = currentQuiz.questions.length;
    const accuracy = Math.round((currentQuiz.score / total) * 100);
    const timeStr = document.getElementById('quiz-timer').textContent.replace('⏱ ', '');

    if (currentQuizChId !== 'combined') {
        const ch = appData.chapters.find(c => c.id === currentQuizChId);
        if (ch && (ch.bestScore === undefined || accuracy > ch.bestScore)) {
            ch.bestScore = accuracy;
        }
    }

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

    document.getElementById('res-emoji').textContent = accuracy >= 80 ? '🏆' : accuracy >= 50 ? '👏' : '📚';
    document.getElementById('res-title').textContent = accuracy >= 80 ? 'Outstanding Performance!' : accuracy >= 50 ? 'Good Effort!' : 'Keep Practicing!';
    document.getElementById('res-percentage').textContent = `${accuracy}%`;
    document.getElementById('res-correct').textContent = currentQuiz.score;
    document.getElementById('res-wrong').textContent = currentQuiz.wrong;
    document.getElementById('res-total').textContent = total;
    document.getElementById('res-time').textContent = timeStr;

    const circle = document.getElementById('ring-progress');
    const circumference = 314.159;
    circle.style.strokeDashoffset = circumference - (accuracy / 100) * circumference;

    showScreen('result');
}

// ==================== ANALYTICS ====================
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

function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

window.onload = loadState;
