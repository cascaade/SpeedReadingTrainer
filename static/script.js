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
        .replaceAll('\n', ' \0 ')
        .replaceAll(/[—–―]/g, '— \x02 ')
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
        speedReadingText.replaceChildren(
            ...words.flatMap((word, i) => {
                const noSpaceAfter = word.endsWith("\x03");
                const cleanWord = noSpaceAfter ? word.slice(0, -1) : word;

                const splitAt = Math.max(2, Math.ceil(cleanWord.length * (3/10)));

                const bold = document.createElement("strong");
                bold.textContent = cleanWord.slice(0, splitAt);

                const normal = document.createElement("span");
                normal.textContent = cleanWord.slice(splitAt);

                const elements = [bold, normal];

                if (i < words.length - 1 && !noSpaceAfter) {
                    elements.push(document.createTextNode(" "));
                }

                return elements;
            })
        );
    } else {
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
