const textInput = document.getElementById("text-input");
const speedReadingText = document.getElementById("speed-reading-text");
const startStopButton = document.getElementById("start-stop-btn");
const speedInputContainer = document.getElementById("speed-input-container");
const speedInput = document.getElementById("speed-input");
const chunkInputContainer = document.getElementById("chunk-input-container");
const chunkInput = document.getElementById("chunk-input");


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

function loop() {
    let subtext = "";
    for (let i = index; i < index + wpc && i < text.length; i++) {
        subtext = subtext + (i == index ? "" : " ") + text[i];
        console.log(i);
    }
    speedReadingText.innerText = subtext;
    console.log(subtext);
    console.log(index);
    console.log(wpc);
    console.warn('----')

    index += wpc;
    if (index >= text.length) {
        stop();
        index = 0;
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
        loop(); // because setInterval waits for timeout before the first call
        console.log(text);
    }
}

textInput.addEventListener("change", onTextInputChange);
checkAndConfigureStartButton();

startStopButton.addEventListener("click", onStartStopClick);