import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import readline from "readline";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "ornith";
const INSTRUCTIONS_PATH = path.resolve(__dirname, "..", "instructions.md");
const OUT_DIR = path.resolve(__dirname, "..", "out");
const CONTEXT_WINDOW = 8192;

interface OllamaStreamChunk {
    response?: string;
    done: boolean;
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
    eval_duration?: number;
    [key: string]: unknown;
}

async function main(): Promise<void> {
    const inputPath = process.argv[2];

    if (!inputPath) {
        console.error("Usage: npm start -- <path-to-input-file>");
        process.exit(1);
    }

    const [instructions, inputText] = await Promise.all([
        readFile(INSTRUCTIONS_PATH, "utf-8"),
        readFile(inputPath, "utf-8"),
    ]);

    const prompt = `${instructions.trim()}\n\n---\n\n${inputText}`;

    console.log(`🤖 Sending "${path.basename(inputPath)}" to model "${MODEL}"...`);
    console.log(`⌨️  Type "q" + Enter anytime to stop generation early.`);

    const abortController = new AbortController();
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => {
        if (line.trim().toLowerCase() === "q") {
            console.log("\n🛑 Stopping generation (received 'q')...");
            abortController.abort();
        }
    });

    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: MODEL,
            prompt,
            stream: true,
            options: {
                num_ctx: CONTEXT_WINDOW,
                num_predict: -1,
            },
        }),
        signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
        const errText = await response.text();
        throw new Error(`Ollama request failed (${response.status}): ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const startTime = Date.now();

    let fullText = "";
    let tokenCount = 0;
    let buffer = "";
    let finalChunk: OllamaStreamChunk | undefined;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.trim()) continue;
                const chunk = JSON.parse(line) as OllamaStreamChunk;

                if (chunk.response) {
                    fullText += chunk.response;
                    tokenCount += 1;
                    const elapsedSeconds = (Date.now() - startTime) / 1000;
                    const tokensPerSecond = elapsedSeconds > 0 ? (tokenCount / elapsedSeconds).toFixed(1) : "0.0";

                    process.stdout.write(`\r⏳ ${tokenCount} tokens generated (~${tokensPerSecond} tokens/sec)`);
                }

                if (chunk.done) {
                    finalChunk = chunk;
                }
            }
        }
    } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (!isAbort) throw err;
    } finally {
        rl.close();
    }
    process.stdout.write("\n");

    if (finalChunk?.eval_count && finalChunk.eval_duration) {
        const seconds = finalChunk.eval_duration / 1_000_000_000;
        const exactTokensPerSecond = (finalChunk.eval_count / seconds).toFixed(1);
        console.log(`📊 Final: ${finalChunk.eval_count} tokens in ${seconds.toFixed(1)}s (~${exactTokensPerSecond} tokens/sec)`);
    }

    if (finalChunk?.done_reason === "length") {
        const used = (finalChunk.prompt_eval_count ?? 0) + (finalChunk.eval_count ?? 0);
        console.log(
            `⚠️  Stopped because it ran out of room (used ~${used} of ${CONTEXT_WINDOW} context tokens). ` +
            `Increase CONTEXT_WINDOW at the top of index.ts and rerun.`
        );
    } else if (finalChunk?.done_reason && finalChunk.done_reason !== "stop") {
        console.log(`⚠️  Stopped for reason: "${finalChunk.done_reason}" (not a normal finish).`);
    }

    await mkdir(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, path.basename(inputPath));
    await writeFile(outPath, fullText, "utf-8");

    console.log("✅ Done. Output saved to:");
    console.log(`file://${outPath}`);
}

main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
});
