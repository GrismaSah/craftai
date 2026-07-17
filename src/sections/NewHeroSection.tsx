"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Plus, Mic, ArrowUp, Info, Loader2 } from 'lucide-react';

const suggestions = [
  'Portfolio website',
  'SaaS landing page',
  'E-commerce store',
  'Blog & newsletter',
  'Startup homepage',
];

export default function NewHeroSection() {
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';
        recognitionRef.current.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }
          if (final) {
            setValue((prev) => {
              const separator = prev ? ' ' : '';
              return prev + separator + final;
            });
            setInterimTranscript('');
          } else {
            setInterimTranscript(interim);
          }
        };
        recognitionRef.current.onerror = () => {
          setIsListening(false);
          setInterimTranscript('');
        };
        recognitionRef.current.onend = () => {
          setIsListening(false);
          setInterimTranscript('');
        };
      }
    }
  }, []);

  const handleVoiceToggle = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
      setInterimTranscript('');
    } else {
      setInterimTranscript('');
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  // Typewriter animation - only plays when input is empty
  useEffect(() => {
    if (value) {
      setDisplayedText('');
      return;
    }

    const prompts = [
      'Build me a landing page for a productivity app with a waitlist...',
      'Create a portfolio for a photographer with a dark theme...',
      'Design an e-commerce store for handmade goods...',
    ];
    let charIndex = 0;
    const current = prompts[currentIndex % prompts.length];

    const interval = setInterval(() => {
      if (charIndex <= current.length) {
        setDisplayedText(current.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setCurrentIndex((i) => (i + 1) % prompts.length);
        }, 2000);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [currentIndex, value]);

  const handleSubmit = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;
    const builderUrl = `/builder?prompt=${encodeURIComponent(prompt.trim())}`;
    window.location.href = builderUrl;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit(value);
    }
  };

  return (
    <section
      className="relative flex flex-col items-center text-center px-6 md:px-16 pt-20 pb-28 overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg, #a8d8e8 0%, #d4eaf5 35%, #e8f4fb 60%, #fde8d0 100%)',
      }}
    >
      <h1 className="font-semibold text-4xl md:text-6xl text-[#111] leading-tight max-w-3xl mt-10 sm:mt-12 md:mt-16 lg:mt-20 mb-5 tracking-tight">
        Turn your ideas into websites
      </h1>
      <p className="text-lg text-[#444] max-w-lg mb-10 leading-relaxed">
        CraftAI builds fully-functional websites in seconds with just your words.{' '}
        No coding necessary.
      </p>

      <div
        className={`w-full max-w-2xl bg-white rounded-2xl overflow-hidden mb-8 transition-all duration-300 ${isFocused ? 'ring-2 ring-[#f05a1a]/20 shadow-lg' : ''}`}
        style={{ boxShadow: isFocused ? '0 8px 40px rgba(240,90,26,0.12)' : '0 8px 40px rgba(0,0,0,0.1)' }}
      >
        <div className="px-6 pt-5 pb-3 text-base text-left min-h-20">
          {isListening ? (
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-end gap-[3px] h-5 shrink-0">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      width: '4px',
                      borderRadius: '2px',
                      backgroundColor: '#bbb',
                      animation: 'voice-wave 1.2s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                      height: '20px',
                    }}
                  />
                ))}
              </div>
              {interimTranscript ? (
                <span className="text-sm text-gray-500 truncate">{interimTranscript}</span>
              ) : (
                <span className="text-sm text-gray-400 font-medium">Listening...</span>
              )}
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder={value ? '' : displayedText}
              disabled={isLoading}
              className="w-full bg-transparent border-none outline-none text-[#111] placeholder:text-[#888] text-base"
            />
          )}
        </div>
        <div className="px-5 pb-4 flex items-center justify-between border-t border-[#e5e5e5] pt-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#f0f0f0] flex items-center justify-center text-[#888]">
              <Plus className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2 bg-[#f0f0f0] rounded-full px-3 py-1">
              <div className="w-8 h-4 rounded-full bg-[#e5e5e5] flex items-center px-0.5">
                <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
              </div>
              <span className="text-xs text-[#444] font-medium">Plan</span>
              <Info className="w-3 h-3 text-[#888]" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isListening ? (
              <button
                onClick={handleVoiceToggle}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Tap to stop
              </button>
            ) : (
              <>
                <button
                  onClick={handleVoiceToggle}
                  disabled={isLoading}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors bg-[#f0f0f0] text-[#888] hover:bg-gray-200"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSubmit(value)}
                  disabled={isLoading || !value.trim()}
                  className="w-10 h-10 rounded-full bg-[#f05a1a] flex items-center justify-center text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-[#888] uppercase tracking-widest font-medium">
          Not sure where to start? Try one of these:
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSubmit(suggestion)}
              disabled={isLoading}
              className="text-sm border border-[#e5e5e5] bg-white text-[#111] px-4 py-2 rounded-full font-medium hover:border-[#f05a1a]/30 hover:bg-[#f05a1a]/5 hover:text-[#f05a1a] transition-all disabled:opacity-50"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
