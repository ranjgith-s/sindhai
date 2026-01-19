import { useState, useEffect, useCallback, useRef } from "react";

export type DictationState = "idle" | "listening" | "processing";

export interface DictationError {
    type: "not-supported" | "permission-denied" | "network" | "no-speech" | "aborted" | "unknown";
    message: string;
}

export interface UseDictationReturn {
    transcript: string;
    isListening: boolean;
    state: DictationState;
    error: DictationError | null;
    isSupported: boolean;
    start: () => void;
    stop: () => void;
    reset: () => void;
}

// Type definitions for Web Speech API
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

declare global {
    interface Window {
        SpeechRecognition?: new () => SpeechRecognition;
        webkitSpeechRecognition?: new () => SpeechRecognition;
    }
}

export function useDictation(): UseDictationReturn {
    const [transcript, setTranscript] = useState("");
    const [state, setState] = useState<DictationState>("idle");
    const [error, setError] = useState<DictationError | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    // Check if Speech Recognition is supported
    const isSupported =
        typeof window !== "undefined" &&
        (window.SpeechRecognition !== undefined || window.webkitSpeechRecognition !== undefined);

    const isListening = state === "listening";

    useEffect(() => {
        if (!isSupported) return;

        // Initialize Speech Recognition
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) return;

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            setState("listening");
            setError(null);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interimTranscript = "";
            let finalTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcriptPiece = result[0].transcript;

                if (result.isFinal) {
                    finalTranscript += transcriptPiece + " ";
                } else {
                    interimTranscript += transcriptPiece;
                }
            }

            if (finalTranscript) {
                setTranscript((prev) => prev + finalTranscript);
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error("Speech recognition error:", event.error);

            let errorType: DictationError["type"] = "unknown";
            let errorMessage = "An error occurred during dictation.";

            switch (event.error) {
                case "not-allowed":
                case "permission-denied":
                    errorType = "permission-denied";
                    errorMessage = "Microphone permission denied. Please allow microphone access.";
                    break;
                case "no-speech":
                    errorType = "no-speech";
                    errorMessage = "No speech detected. Please try again.";
                    break;
                case "network":
                    errorType = "network";
                    errorMessage = "Network error. Please check your connection.";
                    break;
                case "aborted":
                    errorType = "aborted";
                    errorMessage = "Dictation was aborted.";
                    break;
                default:
                    errorMessage = `Dictation error: ${event.error}`;
            }

            setError({ type: errorType, message: errorMessage });
            setState("idle");
        };

        recognition.onend = () => {
            setState("idle");
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [isSupported]);

    const start = useCallback(() => {
        if (!isSupported) {
            setError({
                type: "not-supported",
                message: "Speech recognition is not supported in this browser. Please use Chrome or Edge.",
            });
            return;
        }

        if (state === "listening") return;

        setError(null);
        setTranscript("");

        try {
            recognitionRef.current?.start();
        } catch (err) {
            console.error("Failed to start recognition:", err);
            setError({
                type: "unknown",
                message: "Failed to start dictation. Please try again.",
            });
        }
    }, [isSupported, state]);

    const stop = useCallback(() => {
        if (state !== "listening") return;

        setState("processing");
        recognitionRef.current?.stop();
    }, [state]);

    const reset = useCallback(() => {
        setTranscript("");
        setError(null);
        setState("idle");
    }, []);

    return {
        transcript,
        isListening,
        state,
        error,
        isSupported,
        start,
        stop,
        reset,
    };
}
