import React, { useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../utils";
import { useDictation, type DictationError } from "../../hooks/useDictation";

interface DictationButtonProps {
    onTranscript: (text: string) => void;
    onError?: (error: DictationError) => void;
    variant?: "icon" | "default";
    className?: string;
}

export function DictationButton({
    onTranscript,
    onError,
    variant = "default",
    className,
}: DictationButtonProps) {
    const { transcript, isListening, state, error, isSupported, start, stop, reset } = useDictation();

    // Handle transcript completion
    useEffect(() => {
        if (transcript && state === "idle") {
            onTranscript(transcript);
            reset();
        }
    }, [transcript, state, onTranscript, reset]);

    // Handle errors
    useEffect(() => {
        if (error) {
            onError?.(error);
        }
    }, [error, onError]);

    const handleClick = () => {
        if (isListening) {
            stop();
        } else {
            start();
        }
    };

    if (!isSupported) {
        return null; // Don't render if not supported
    }

    const iconSize = variant === "icon" ? 16 : 16;

    return (
        <Button
            variant={isListening ? "default" : "outline"}
            size={variant === "icon" ? "icon" : "sm"}
            onClick={handleClick}
            className={cn(
                "relative transition-all",
                isListening && "bg-red-600 hover:bg-red-700 text-white animate-pulse",
                className
            )}
            aria-label={isListening ? "Stop dictation" : "Start dictation"}
            title={
                isListening
                    ? "Stop dictation"
                    : state === "processing"
                        ? "Processing..."
                        : "Start dictation"
            }
            disabled={state === "processing"}
        >
            {state === "processing" ? (
                <Loader2 className={cn("animate-spin", variant === "default" && "mr-2")} size={iconSize} />
            ) : isListening ? (
                <MicOff className={variant === "default" ? "mr-2" : ""} size={iconSize} />
            ) : (
                <Mic className={variant === "default" ? "mr-2" : ""} size={iconSize} />
            )}
            {variant === "default" && (
                <span>{isListening ? "Stop" : state === "processing" ? "Processing" : "Dictate"}</span>
            )}
        </Button>
    );
}
