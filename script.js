const textInput = document.getElementById("text-input");
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
const fsButton = document.getElementById("fs-btn");

const backAmt = 1;
const farBackAmt = 10;

let state = "waiting";
let reader;

let text = []; // words of text
let index = 1;
let wpc = 1; // words per chunk

let pauses = [1, .5, .2]; // (x+1)*wpm

function lockOptionsForStart() {
    startStopButton.classList.replace('start-btn', 'stop-btn');
    startStopButton.innerText = "Stop";
    speedInput.disabled = true;
    speedInputContainer.classList.add('disabled');
    chunkInput.disabled = true;
    chunkInputContainer.classList.add('disabled');
}

function unlockOptionsForStop() {
    startStopButton.classList.replace('stop-btn', 'start-btn');
    startStopButton.innerText = "Start";
    speedInput.disabled = false;
    speedInputContainer.classList.remove('disabled');
    chunkInput.disabled = false;
    chunkInputContainer.classList.remove('disabled');
}

function checkAndConfigureStartButton() {
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
        .replaceAll(/[—–―]/g, '— \x02 —')
        .replaceAll(/,/g, ', \x01 ')
        .replaceAll(/;/g, ', \x01 ')
        .replaceAll(/:/g, ', \x01 ')
        .replaceAll(/([.!?])/g, '$1 \0 ')
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

function onTextInputChange() {
    checkAndConfigureStartButton();
    index = 1;
    lastRealWord = "";
    parseText();
    updateText();
}

function onStartStopClick() {
    if (state === "running") {
        stop();
    } else {
        checkAndConfigureStartButton();

        if (state !== "ready") { return }
        state = "running";

        lockOptionsForStart();

        updateWPC();
        parseText();

        reader = setTimeout(loop, getChunkDuration(index - 1));
        updateText();
    }
}

function onFullscreen() {
    document.body.classList.toggle("fullscreen");
}

textInput.addEventListener("change", onTextInputChange);
checkAndConfigureStartButton();
chunkInput.addEventListener("change", () => {
    updateWPC();
    updateText();
});

startStopButton.addEventListener("click", onStartStopClick);
farBackButton.addEventListener("click", onFarBackClick);
backButton.addEventListener("click", onBackClick);
farForwardButton.addEventListener("click", onFarForwardClick);
forwardButton.addEventListener("click", onForwardClick);
fsButton.addEventListener("click", onFullscreen);
