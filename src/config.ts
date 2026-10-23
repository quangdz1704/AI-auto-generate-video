import "dotenv/config";

export type TtsProvider = "omnivoice" | "vieneu";

export interface Config {
    ttsProvider: TtsProvider;

    // OmniVoice (local TTS server)
    omnivoiceEndpoint: string;

    // VieNeu-TTS v3 Turbo's local speech API
    vieneuEndpoint: string;
    vieneuVoice?: string;
    vieneuApiKey?: string;

    ttsConcurrency: number;
}

function intDefault(name: string, def: number): number {
    const v = process.env[name];
    if (!v) return def;
    const n = parseInt(v, 10);
    if (isNaN(n))
        throw new Error(`Env var ${name} must be integer, got "${v}"`);
    return n;
}

export function loadConfig(scriptProvider?: TtsProvider): Config {
    // An environment override lets users compare the same script with both providers.
    const provider = process.env.TTS_PROVIDER ?? scriptProvider ?? "omnivoice";
    if (provider !== "omnivoice" && provider !== "vieneu") {
        throw new Error(
            `TTS_PROVIDER must be "omnivoice" or "vieneu", got "${provider}"`,
        );
    }

    return {
        ttsProvider: provider,
        omnivoiceEndpoint:
            process.env.OMNIVOICE_ENDPOINT ?? "http://127.0.0.1:8123",
        vieneuEndpoint:
            process.env.VIENEU_ENDPOINT ?? "http://127.0.0.1:8000",
        vieneuVoice: process.env.VIENEU_VOICE?.trim() || undefined,
        vieneuApiKey: process.env.VIENEU_API_KEY || undefined,
        ttsConcurrency: intDefault("TTS_CONCURRENCY", 1),
    };
}
