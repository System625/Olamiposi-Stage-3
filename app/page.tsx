'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { ChangeEvent } from 'react';

type ProcessingType = 'summarize' | 'translate' | 'detect' | null;
type APIAvailability = {
  summarizer: boolean;
  translator: boolean;
  languageDetector: boolean;
};

type DownloadStatus = {
  isDownloading: boolean;
  progress: number;
  total: number;
};

interface DownloadProgressEvent extends Event {
  loaded: number;
  total: number;
}

type SummarizerInstance = {
  generateSummary: (text: string) => Promise<string>;
  ready: Promise<void>;
  addEventListener: (event: string, handler: EventListener) => void;
};

declare global {
  interface Window {
    ai?: {
      summarizer: {
        capabilities: () => Promise<{ available: 'no' | 'readily' | 'after-download' }>;
        create: (options?: {
          monitor?: (m: EventTarget) => void;
          sharedContext?: string;
          type?: 'key-points';
          format?: 'markdown';
          length?: 'medium';
        }) => Promise<SummarizerInstance>;
      };
      translator: {
        detectLanguage: (text: string) => Promise<string>;
        translateText: (text: string, targetLang: string) => Promise<string>;
      };
    };
  }
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState('');
  const [processing, setProcessing] = useState<ProcessingType>(null);
  const [error, setError] = useState('');
  const [apiAvailability, setApiAvailability] = useState<APIAvailability>({
    summarizer: false,
    translator: false,
    languageDetector: false,
  });
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>({
    isDownloading: false,
    progress: 0,
    total: 0,
  });
  const [summarizer, setSummarizer] = useState<SummarizerInstance | null>(null);

  useEffect(() => {
    const initializeSummarizer = async () => {
      if (!window.ai?.summarizer) {
        setError('Summarizer API is not available in this browser');
        return;
      }

      try {
        const { available } = await window.ai.summarizer.capabilities();
        
        if (available === 'no') {
          setError('Summarizer API is not usable on this device');
          return;
        }

        const options = {
          type: 'key-points' as const,
          format: 'markdown' as const,
          length: 'medium' as const,
          monitor: (m: EventTarget) => {
            const progressHandler = (e: Event) => {
              const progressEvent = e as DownloadProgressEvent;
              setDownloadStatus({
                isDownloading: true,
                progress: progressEvent.loaded,
                total: progressEvent.total,
              });
            };
            m.addEventListener('downloadprogress', progressHandler);
          },
        };

        const summarizerInstance = await window.ai.summarizer.create(options);
        
        if (available === 'after-download') {
          await summarizerInstance.ready;
        }
        
        setDownloadStatus(prev => ({ ...prev, isDownloading: false }));
        setSummarizer(summarizerInstance);
        setApiAvailability(prev => ({ ...prev, summarizer: true }));
      } catch (err) {
        setError('Failed to initialize Summarizer API');
        console.error('Summarizer initialization error:', err);
      }
    };

    initializeSummarizer();
  }, []);

  const handleTextProcess = async (type: ProcessingType) => {
    if (!inputText.trim()) {
      setError('Please enter some text to process');
      return;
    }

    setProcessing(type);
    setError('');
    
    try {
      switch (type) {
        case 'summarize':
          if (summarizer) {
            const summary = await summarizer.generateSummary(inputText);
            setResult(summary);
          } else {
            throw new Error('Summarizer is not ready. Please wait for initialization.');
          }
          break;
        case 'translate':
          if (apiAvailability.translator && window.ai?.translator) {
            const sourceLang = await window.ai.translator.detectLanguage(inputText);
            const translation = await window.ai.translator.translateText(inputText, 'en');
            setResult(`Translated from ${sourceLang} to English:\n${translation}`);
          } else {
            throw new Error('Translation API is not available. Please enable it in Chrome flags.');
          }
          break;
        case 'detect':
          if (apiAvailability.translator && window.ai?.translator) {
            const language = await window.ai.translator.detectLanguage(inputText);
            setResult(`Detected language: ${language}`);
          } else {
            throw new Error('Language Detection API is not available. Please enable it in Chrome flags.');
          }
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while processing');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8 text-center">AI Text Processor</h1>
      
      {downloadStatus.isDownloading && (
        <Card className="p-6 mb-8 bg-blue-50 border-blue-200">
          <h2 className="text-lg font-semibold mb-4">Downloading Summarizer Model...</h2>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(downloadStatus.progress / downloadStatus.total) * 100}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {Math.round((downloadStatus.progress / downloadStatus.total) * 100)}% complete
          </p>
        </Card>
      )}

      {!apiAvailability.summarizer && !downloadStatus.isDownloading && (
        <Card className="p-6 mb-8 bg-yellow-50 border-yellow-200">
          <h2 className="text-lg font-semibold mb-4">Setup Required</h2>
          <p className="mb-4">To use this application, you need to:</p>
          <ol className="list-decimal list-inside space-y-2">
            <li>Use Google Chrome browser</li>
            <li>Enable experimental AI features in Chrome:
              <ol className="list-disc list-inside ml-6 mt-2 space-y-1">
                <li>Open <code className="bg-gray-100 px-2 py-1 rounded">chrome://flags</code> in your browser</li>
                <li>Enable &quot;Experimental AI features&quot;</li>
                <li>Enable &quot;AI Summarization&quot;</li>
                <li>Enable &quot;Translation API&quot;</li>
                <li>Enable &quot;Language Detection API&quot;</li>
                <li>Restart Chrome</li>
              </ol>
            </li>
          </ol>
        </Card>
      )}
      
      <Card className="p-6 shadow-lg">
        <div className="space-y-4">
          <Textarea
            placeholder="Enter your text here..."
            className="min-h-[200px] p-4"
            value={inputText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
            aria-label="Text input for processing"
          />
          
          <div className="flex flex-wrap gap-4 justify-center">
            <Button
              onClick={() => handleTextProcess('summarize')}
              disabled={processing !== null || !summarizer || downloadStatus.isDownloading}
              aria-label="Summarize text"
            >
              {processing === 'summarize' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {downloadStatus.isDownloading ? 'Downloading...' : 'Summarize'}
            </Button>
            
            <Button
              onClick={() => handleTextProcess('translate')}
              disabled={processing !== null || !apiAvailability.translator}
              aria-label="Translate text"
            >
              {processing === 'translate' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Translate
            </Button>
            
            <Button
              onClick={() => handleTextProcess('detect')}
              disabled={processing !== null || !apiAvailability.languageDetector}
              aria-label="Detect language"
            >
              {processing === 'detect' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Detect Language
            </Button>
          </div>

          {error && (
            <div className="text-red-500 text-center p-4" role="alert">
              {error}
            </div>
          )}

          {result && (
            <Card className="p-4 mt-4 bg-gray-50">
              <h2 className="text-lg font-semibold mb-2">Result:</h2>
              <p className="whitespace-pre-wrap">{result}</p>
            </Card>
          )}
        </div>
      </Card>
    </main>
  );
}
