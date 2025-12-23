const textInput = document.getElementById("text-input");
const speedReadingText = document.getElementById("speed-reading-text");
const startStopButton = document.getElementById("start-stop-btn");
const speedInputContainer = document.getElementById("speed-input-container");
const speedInput = document.getElementById("speed-input");
const chunkInputContainer = document.getElementById("chunk-input-container");
const chunkInput = document.getElementById("chunk-input");
const farBackButton = document.getElementById("far-back-btn");
const backButton = document.getElementById("back-btn");

const backAmt = 1;
const farBackAmt = 10;

let state = "waiting";
let reader;

let text = []; // words of text
let index = 0;
let wpc = 1; // words per chunk

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
    if (textInput.value.trim() == "") {
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
        clearInterval(reader);
        reader = null;
    }
}

function updateText() {
    let subtext = "";
    let idx = index - 1;

    for (let i = idx; i < idx + wpc && i < text.length; i++) {
        subtext = subtext + (i == idx ? "" : " ") + (text[i] ?? "");
    }

    speedReadingText.innerText = subtext;
}

function onBackClick() {
    index = Math.max(0, index - backAmt * wpc);
    updateText();
}

function onFarBackClick() {
    index = Math.max(0, index - farBackAmt * wpc);
    updateText();
}

function loop() {
    index += wpc;
    if (index > text.length) {
        stop();
        index = 0;
    } else {
        updateText();
    }
}

function onTextInputChange() {
    checkAndConfigureStartButton();
    index = 0;
}

function onStartStopClick() {
    if (state == "running") {
        stop();
    } else {
        checkAndConfigureStartButton();

        if (state != "ready") { return };
        state = "running";

        lockOptionsForStart();

        let timeout = 60 * 1000 / Math.max(1, parseInt(speedInput.value) ?? 120);
        wpc = Math.max(1, parseInt(chunkInput.value) || 3);
        timeout *= wpc;

        text = textInput.value.trim().replaceAll('\n', ' ').split(' ');
        reader = setInterval(loop, timeout);
        updateText();
    }
}

textInput.addEventListener("change", onTextInputChange);
checkAndConfigureStartButton();

startStopButton.addEventListener("click", onStartStopClick);
farBackButton.addEventListener("click", onFarBackClick);
backButton.addEventListener("click", onBackClick);