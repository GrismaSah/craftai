import { useState, useEffect, useCallback, useRef } from 'react';

export interface CodeLine {
  text: string;
  color: string | null;
}

const defaultCodeLines: CodeLine[] = [
  { text: "import React from 'react';", color: "#C586C0" },
  { text: "", color: null },
  { text: "export function Hero() {", color: "#4EC9B0" },
  { text: "  return (", color: "#D4D4D4" },
  { text: '    <section className="bg-gradient-to-b">', color: "#CE9178" },
  { text: '      <div className="max-w-4xl mx-auto">', color: "#CE9178" },
  { text: '        <h1 className="text-5xl font-bold">', color: "#9CDCFE" },
  { text: "          Build something amazing", color: "#CE9178" },
  { text: "        </h1>", color: "#808080" },
  { text: '        <p className="text-lg mt-4">', color: "#9CDCFE" },
  { text: "          With AI-powered generation", color: "#CE9178" },
  { text: "        </p>", color: "#808080" },
  { text: "      </div>", color: "#808080" },
  { text: "    </section>", color: "#808080" },
  { text: "  );", color: "#D4D4D4" },
  { text: "}", color: "#D4D4D4" },
];

interface UseCodeTypingOptions {
  lines?: CodeLine[];
  isPlaying?: boolean;
  speed?: number;
}

export function useCodeTyping(options: UseCodeTypingOptions = {}) {
  const { lines = defaultCodeLines, isPlaying = false, speed = 30 } = options;
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ lineIndex: 0, charIndex: 0 });

  const reset = useCallback(() => {
    setCurrentLineIndex(0);
    setCurrentCharIndex(0);
    setDisplayedLines([]);
    stateRef.current = { lineIndex: 0, charIndex: 0 };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const tick = () => {
      setCurrentCharIndex((prevChar) => {
        const { lineIndex } = stateRef.current;
        const line = lines[lineIndex];
        if (!line) return prevChar;

        if (prevChar >= line.text.length) {
          setCurrentLineIndex((prevLine) => {
            if (prevLine >= lines.length - 1) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              timeoutRef.current = setTimeout(() => {
                setCurrentLineIndex(0);
                setCurrentCharIndex(0);
                setDisplayedLines([]);
                stateRef.current = { lineIndex: 0, charIndex: 0 };
              }, 2000);
              return prevLine;
            }
            const nextLine = prevLine + 1;
            stateRef.current.lineIndex = nextLine;
            return nextLine;
          });

          if (intervalRef.current) clearInterval(intervalRef.current);
          timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(tick, speed);
          }, 200);
          stateRef.current.charIndex = 0;
          return 0;
        }
        stateRef.current.charIndex = prevChar + 1;
        return prevChar + 1;
      });
    };

    intervalRef.current = setInterval(tick, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPlaying, speed, lines]);

  useEffect(() => {
    const newDisplayed: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i < currentLineIndex) {
        newDisplayed.push(lines[i].text);
      } else if (i === currentLineIndex) {
        newDisplayed.push(lines[i].text.substring(0, currentCharIndex));
      } else {
        newDisplayed.push('');
      }
    }
    setDisplayedLines(newDisplayed);
  }, [currentLineIndex, currentCharIndex, lines]);

  return { displayedLines, lines, currentLineIndex, currentCharIndex, reset };
}
