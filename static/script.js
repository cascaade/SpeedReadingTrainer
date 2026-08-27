const textInput = document.getElementById("text-input");
const speedReadingTextContainer = document.getElementById("speed-reading-text-container");
const speedReadingText = document.getElementById("speed-reading-text");
const startStopButton = document.getElementById("start-stop-btn");
const speedInputContainer = document.getElementById("speed-input-container");
const speedInput = document.getElementById("speed-input");
const chunkInputContainer = document.getElementById("chunk-input-container");
const chunkInput = document.getElementById("chunk-input");
const farBackButton = document.getElementById("far-back-btn");
const backButton = document.getElementById("back-btn");
const forwardButton = document.getElementById("forward-btn");
const farForwardButton = document.getElementById("far-forward-btn");
const advButton = document.getElementById("adv-btn");

const backAmt = 1;
const farBackAmt = 10;

let state = "waiting";
let mode = "tokens"; // "tokens" | "spotlight" | "cursor"

let reader;
let streamFrame = null;

let text = []; // words of text
let index = 1;
let wpc = 1; // words per chunk

let pauses = [1, .75, .3]; // (x+1)*wpm

const tagColors = new Map(Object.entries({
    SUBJECT: "hsl(20, 50%, 80%)",
    ACTION: "hsl(40, 50%, 80%)",
    OBJECT: "hsl(240, 50%, 80%)",
    NOUN: "hsl(80, 50%, 80%)",
    MODIFIER: "hsl(100, 50%, 80%)",
    SUBORDINATE: "hsl(120, 50%, 80%)",
    CLAUSE: "hsl(140, 50%, 80%)",
    CAUSE: "hsl(160, 50%, 80%)",
    CONDITION: "hsl(180, 50%, 80%)",
    PURPOSE: "hsl(200, 50%, 80%)",
    CONTRAST: "hsl(220, 50%, 80%)",
    TIME: "hsl(60, 50%, 80%)",
    PREPOSITIONAL: "hsl(260, 50%, 80%)",
    CONNECTOR: "hsl(280, 50%, 80%)",
    QUOTATION: "hsl(300, 50%, 80%)",
    LIST: "hsl(320, 50%, 80%)",
    EMPHASIS: "hsl(340, 50%, 80%)",
}));

function lockOptionsForStart() {
    startStopButton.classList.replace('start-btn', 'stop-btn');
    startStopButton.innerText = "Stop";
    speedInput.disabled = true;
    speedInputContainer.classList.add('disabled');
    chunkInput.disabled = true;
    chunkInputContainer.classList.add('disabled');
    advButton.disabled = true;
}

function unlockOptionsForStop() {
    startStopButton.classList.replace('stop-btn', 'start-btn');
    startStopButton.innerText = "Start";
    speedInput.disabled = false;
    speedInputContainer.classList.remove('disabled');
    chunkInput.disabled = false;
    chunkInputContainer.classList.remove('disabled');
    advButton.disabled = false;
}

function checkAndConfigureStartButton() {
    if (mode === "tokens") {
        state = "waiting";
        startStopButton.disabled = true;
        return;
    }

    if (textInput.value.trim() === "") {
        state = "waiting";
        startStopButton.disabled = true;
    } else {
        state = "ready";
        startStopButton.disabled = false;
    }
}

function stop() {
    checkAndConfigureStartButton();
    unlockOptionsForStop();

    if (reader) {
        clearTimeout(reader);
        reader = null;
    }

    if (streamFrame) {
        cancelAnimationFrame(streamFrame);
        streamFrame = null;
    }
}

function getWordDuration() {
    return 60 * 1000 / Math.max(1, parseInt(speedInput.value) || 120);
}

function updateWPC() {
    wpc = Math.max(1, parseInt(chunkInput.value) || 3);
}

function getPauseLength(word) {
    if (word === "\0") {
        return pauses[0] * getWordDuration();
    } else if (word === "\x01") {
        return pauses[1] * getWordDuration();
    } else if (word === "\x02") {
        return pauses[2] * getWordDuration();
    }
}

function isSpecialChar(word) {
    return word === "\0" || word === "\x01" || word === "\x02";
}

function getChunkDuration(startIdx) {
    let delay = 0;

    for (let i = startIdx; i < startIdx + wpc && i < text.length; i++) {
        let word = text[i] ?? "";
        delay += getPauseLength(word) ?? getWordDuration();
    }

    return delay;
}

function renderSemanticText(output) {
    speedReadingText.replaceChildren();

    const outputMatch = output.match(
        /<OUTPUT\b[^>]*>([\s\S]*?)<\/OUTPUT\s*>/i
    );

    if (!outputMatch) {
        renderPlainTokenText(output);
        return;
    }

    const semanticText = outputMatch[1];

    /*
     * Parse the markup as a document fragment.
     *
     * DOMParser lets us handle arbitrarily nested semantic tags without
     * having to manually track opening/closing tags.
     */
    const parser = new DOMParser();
    const doc = parser.parseFromString(
        `<div id="root">${semanticText}</div>`,
        "text/html"
    );

    const root = doc.getElementById("root");

    if (!root) {
        renderPlainTokenText(semanticText);
        return;
    }

    /*
     * Convert semantic tags into spans.
     *
     * Everything else is treated as text rather than being copied into
     * the real DOM. This prevents arbitrary HTML from the model from
     * becoming executable/visible markup.
     */
    const fragment = document.createDocumentFragment();

    for (const child of root.childNodes) {
        fragment.appendChild(convertSemanticNode(child));
    }

    speedReadingText.appendChild(fragment);
}

function convertSemanticNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.nodeValue ?? "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return document.createDocumentFragment();
    }

    const tagName = node.tagName.toUpperCase();

    /*
     * Only our explicitly allowed semantic tags become semantic spans.
     */
    if (tagColors.get(tagName)) {
        const span = document.createElement("span");
        span.classList.add(`mod`);
        span.classList.add(`mod-${tagName.toLowerCase()}`);
        span.style.setProperty("--mod-color", tagColors.get(tagName));

        for (const child of node.childNodes) {
            span.appendChild(convertSemanticNode(child));
        }

        return span;
    }

    /*
     * Unknown HTML elements are NOT copied into the real DOM.
     *
     * Their children are preserved as plain text/content, which means
     * something like <script>...</script> cannot become a real script.
     */
    const fragment = document.createDocumentFragment();

    for (const child of node.childNodes) {
        fragment.appendChild(convertSemanticNode(child));
    }

    return fragment;
}

function renderPlainTokenText(text) {
    speedReadingText.replaceChildren();

    const paragraph = document.createElement("p");

    const words = text
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    for (let i = 0; i < words.length; i++) {
        const word = words[i];

        const splitAt = Math.ceil(word.length / 4);

        const bold = document.createElement("strong");
        bold.textContent = word.slice(0, splitAt);

        const normal = document.createElement("span");
        normal.textContent = word.slice(splitAt);

        paragraph.append(bold, normal);

        if (i < words.length - 1) {
            paragraph.appendChild(document.createTextNode(" "));
        }
    }

    speedReadingText.appendChild(paragraph);
}

let lastRealWord = "";

function updateText() {
    let subtext = "";
    let idx = index - 1;

    for (let i = idx; i < idx + wpc && i < text.length; i++) {
        let word = text[i] ?? "";
        let display;

        if (isSpecialChar(word)) {
            display = (wpc === 1) ? lastRealWord : "";
        } else {
            display = word;
            lastRealWord = word;
        }

        subtext = subtext + (i === idx ? "" : " ") + display;
    }

    speedReadingText.innerText = subtext;
}

function onBackClick() {
    index = Math.max(1, index - backAmt * wpc);
    updateText();
}

function onFarBackClick() {
    index = Math.max(1, index - farBackAmt * wpc);
    updateText();
}

function onForwardClick() {
    index = Math.min(text.length, index + backAmt * wpc);
    updateText();
}

function onFarForwardClick() {
    index = Math.min(text.length, index + farBackAmt * wpc);
    updateText();
}

function parseText() {
    text = textInput.value
        .trim()
        .replaceAll('\n', '\n \0 ')
        .replaceAll(/[—–―]/g, '—\x03 \x02 ')
        .replaceAll(/([,;:)(\/]) /g, '$1 \x01 ')
        .replaceAll(/([.!?]) /g, '$1 \0 ')
        .replaceAll('-', '-\x03 ')
        .split(/ +/)
        .filter(word => word.length > 0);
}

function loop() {
    index += wpc;
    if (index > text.length) {
        stop();
        index = 0;
        return;
    }

    updateText();

    let delay = getChunkDuration(index);
    reader = setTimeout(loop, delay);
}

function resetClassicText() {
    speedReadingText.className = "mode-classic";
    speedReadingText.style.transform = "";
}

function getRealWords() {
    return text.filter(word => !isSpecialChar(word));
}

function setupStreamText() {
    let words = getRealWords();

    speedReadingText.className = "mode-stream";
    speedReadingText.style.transform = "translate3d(0, 0, 0)";
    speedReadingText.innerText = words.join(" ");

    let fullWidth = speedReadingText.getBoundingClientRect().width;
    let avgWordWidth = words.length > 0 ? fullWidth / words.length : 0;

    return { fullWidth, avgWordWidth };
}

function startStream() {
    updateWPC();
    parseText();

    let { fullWidth, avgWordWidth } = setupStreamText();
    let pixelsPerMs = avgWordWidth / getWordDuration();
    let containerWidth = speedReadingTextContainer.clientWidth;
    let totalDistance = fullWidth + containerWidth;
    let startTime = null;

    function frame(timestamp) {
        if (startTime === null) startTime = timestamp;

        let elapsed = timestamp - startTime;
        let traveled = pixelsPerMs * elapsed;
        let x = containerWidth - traveled;

        x = Math.round(x);

        speedReadingText.style.transform = `translate3d(${x}px, 0, 0)`;

        if (traveled >= totalDistance) {
            stop();
            return;
        }

        streamFrame = requestAnimationFrame(frame);
    }

    streamFrame = requestAnimationFrame(frame);
}

function onTextInputChange() {
    checkAndConfigureStartButton();
    index = 1;
    lastRealWord = "";
    parseText();

    if (mode === "tokens") {
        let words = getRealWords();
        speedReadingText.replaceChildren();

        let paragraph = document.createElement("p");

        for (let i = 0; i < words.length; i++) {
            const rawWord = words[i];

            const hasNewline = rawWord.endsWith("\n");
            const noSpaceAfter = rawWord.endsWith("\x03");

            // Remove control characters before displaying the word.
            const cleanWord = rawWord.replace(/[\n\x03]+$/, "");

            const splitAt = Math.ceil(cleanWord.length / 4);

            const bold = document.createElement("strong");
            bold.textContent = cleanWord.slice(0, splitAt);

            const normal = document.createElement("span");
            normal.textContent = cleanWord.slice(splitAt);

            paragraph.append(bold, normal);

            // Newline means: finish this paragraph.
            if (hasNewline) {
                speedReadingText.appendChild(paragraph);
                paragraph = document.createElement("p");
                continue;
            }

            // \x03 means: don't insert a space after this word.
            if (!noSpaceAfter && i < words.length - 1) {
                paragraph.appendChild(document.createTextNode(" "));
            }
        }

        // Don't append an empty paragraph if the text ended with \n.
        if (paragraph.childNodes.length > 0) {
            speedReadingText.appendChild(paragraph);
        }
    } else {
        parseText();
        updateText();
    }
}

function onStartStopClick() {
    if (mode === "tokens") { return }

    if (state === "running") {
        stop();
    } else {
        checkAndConfigureStartButton();

        if (state !== "ready") { return }
        state = "running";

        lockOptionsForStart();

        if (mode === "stream") {
            startStream();
        } else {
            resetClassicText();
            updateWPC();
            parseText();
            reader = setTimeout(loop, getChunkDuration(index - 1));
            updateText();
        }
    }
}

textInput.addEventListener("change", onTextInputChange);
checkAndConfigureStartButton();
chunkInput.addEventListener("change", () => {
    updateWPC();

    if (mode === "stream") {
        setupStreamText();
    } else {
        updateText();
    }
});

startStopButton.addEventListener("click", onStartStopClick);
farBackButton.addEventListener("click", onFarBackClick);
backButton.addEventListener("click", onBackClick);
farForwardButton.addEventListener("click", onFarForwardClick);
forwardButton.addEventListener("click", onForwardClick);
advButton.addEventListener("click", () => {
    // if (mode === "tokens") mode = "stream";
    // else mode = "tokens";

    mode = "tokens";

    speedReadingText.className = "mode-" + mode;
    advButton.innerText = mode;
});
