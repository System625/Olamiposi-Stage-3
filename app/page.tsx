'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  summarize: (text: string) => Promise<string>;
  ready: Promise<void>;
  addEventListener: (event: string, handler: EventListener) => void;
};

type TranslatorInstance = {
  translate: (text: string) => Promise<string>;
  ready?: Promise<void>;
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
        translateText: (text: string, targetLang: string) => Promise<string>;
        capabilities: () => Promise<{
          languagePairAvailable: (source: string, target: string) => Promise<'no' | 'readily' | 'after-download'>;
        }>;
        create: (options: {
          sourceLanguage: string;
          targetLanguage: string;
          monitor?: (m: EventTarget) => void;
        }) => Promise<TranslatorInstance>;
      };
      languageDetector?: {
        capabilities: () => Promise<{ available: 'no' | 'readily' | 'after-download' }>;
        create: (options?: {
          monitor?: (m: EventTarget) => void;
        }) => Promise<{
          detect: (text: string) => Promise<Array<{ detectedLanguage: string; confidence: number }>>;
          ready?: Promise<void>;
        }>;
      };
    };
  }
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'tr', name: 'Turkish' },
] as const;

type Message = {
  id: string;
  text: string;
  type: 'input' | 'output';
  detectedLanguage?: {
    name: string;
    code: string;
    confidence: number;
  };
  showSummarize?: boolean;
};

export default function Home() {
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState<{
    summarize: boolean;
    translate: boolean;
    detect: boolean;
  }>({ summarize: false, translate: false, detect: false });
  const [error, setError] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [apiAvailability, setApiAvailability] = useState<APIAvailability>({
    summarizer: false,
    translator: false,
    languageDetector: false,
  });
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus & { type: 'summarizer' | 'translator' | null }>({
    isDownloading: false,
    progress: 0,
    total: 0,
    type: null
  });
  const [summarizer, setSummarizer] = useState<SummarizerInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Add scroll to bottom effect
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const initializeSummarizer = async () => {
      // First check if the API is supported
      const aiApi = window.ai;
      if (!('ai' in window && 'summarizer' in (aiApi || {}))) {
        setError('Summarizer API is not supported in this browser');
        console.log('Summarizer API support check failed');
        return;
      }

      console.log('Summarizer API is supported');

      try {
        if (!window.ai?.summarizer) {
          throw new Error('Summarizer API not found');
        }

        const { available } = await window.ai.summarizer.capabilities();        
        
        if (available === 'no') {
          setError('Summarizer API is not usable on this device');
          return;
        }

        // Try to create the summarizer instance with progress monitoring
        try {
          const summarizerInstance = await window.ai.summarizer.create({
            type: 'key-points' as const,
            format: 'markdown' as const,
            length: 'medium' as const,
            sharedContext: 'Summarize the following text into key points, maintaining important details and context.',
            monitor(m) {
              m.addEventListener('downloadprogress', ((e: Event) => {
                const progressEvent = e as DownloadProgressEvent;
                console.log(`Downloaded ${progressEvent.loaded} of ${progressEvent.total} bytes.`);
                setDownloadStatus({
                  isDownloading: true,
                  progress: progressEvent.loaded,
                  total: progressEvent.total,
                  type: 'summarizer'
                });
              }) as EventListener);
            },
          });

          if (available === 'after-download') {
            await summarizerInstance.ready;
          }
          
          setDownloadStatus(prev => ({ ...prev, isDownloading: false, type: null }));
          setSummarizer(summarizerInstance);
          setApiAvailability(prev => ({ ...prev, summarizer: true }));
          console.log('Summarizer initialized successfully');
        } catch (initError) {
          console.error('Error creating summarizer:', initError);
          setError('Failed to create summarizer instance');
        }
      } catch (err) {
        setError('Failed to initialize Summarizer API');
        console.error('Summarizer initialization error:', err);
      }
    };

    initializeSummarizer();
  }, []);


  useEffect(() => {
    const initializeTranslator = async () => {
      console.log('Initializing translator and language detector...');
      
      try {
        // Check if the APIs are supported
        const hasTranslator = 'ai' in window && 'translator' in (window.ai || {});
        const hasLanguageDetector = 'ai' in window && 'languageDetector' in (window.ai || {});
        console.log('Has translator:', hasTranslator);
        console.log('Has language detector:', hasLanguageDetector);

        if (!hasTranslator || !window.ai?.translator) {
          throw new Error('Translation API is not supported');
        }

        // Initialize translator
        console.log('Creating initial translator...');
        const initialTranslator = await window.ai.translator.create({
          sourceLanguage: 'en',
          targetLanguage: 'es',
          monitor(m) {
            m.addEventListener('downloadprogress', ((e: Event) => {
              const progressEvent = e as DownloadProgressEvent;
              setDownloadStatus({
                isDownloading: true,
                progress: progressEvent.loaded,
                total: progressEvent.total,
                type: 'translator'
              });
            }) as EventListener);
          },
        });

        // Wait for the translator to be ready
        if (initialTranslator.ready) {
          console.log('Waiting for translator to be ready...');
          await initialTranslator.ready;
        }

        setApiAvailability(prev => ({ ...prev, translator: true }));
        
        // Initialize language detector if available
        if (hasLanguageDetector && window.ai?.languageDetector) {
          try {
            console.log('Checking language detector capabilities...');
            const { available } = await window.ai.languageDetector.capabilities();
            
            if (available === 'no') {
              console.log('Language detector is not available on this device');
              return;
            }

            console.log('Creating language detector...');
            const detector = await window.ai.languageDetector.create({
              monitor(m) {
                m.addEventListener('downloadprogress', ((e: Event) => {
                  const progressEvent = e as DownloadProgressEvent;
                  console.log(`Downloaded detector: ${progressEvent.loaded} of ${progressEvent.total} bytes.`);
                }) as EventListener);
              },
            });

            if (available === 'after-download' && detector.ready) {
              console.log('Waiting for language detector to be ready...');
              await detector.ready;
            }

            // Test the detector
            const testResult = await detector.detect('Hello, world!');
            console.log('Language detection test result:', testResult);
            if (testResult && testResult.length > 0) {
              console.log('Language detection is working properly');
              setApiAvailability(prev => ({ ...prev, languageDetector: true }));
            }
          } catch (error) {
            console.error('Language detector initialization error:', error);
          }
        }
        
        setDownloadStatus(prev => ({ ...prev, isDownloading: false, type: null }));
        console.log('Initialization completed successfully');
      } catch (error) {
        console.error('Initialization error:', error);
        setError('Failed to initialize APIs. Please ensure Chrome flags are enabled and restart browser.');
      }
    };

    initializeTranslator();
  }, []);

  const cleanMarkdownFormatting = (text: string): string => {
    return text
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '•')   // Replace bullet points with dots
      .replace(/_{1,2}/g, '') // Remove underscores for italic/bold
      .replace(/#{1,6}\s/g, '') // Remove heading markers
      .replace(/`/g, ''); // Remove code markers
  };

  const detectLanguage = async (text: string): Promise<{ name: string; code: string; confidence: number } | undefined> => {
    if (!window.ai?.languageDetector) return undefined;
    
    try {
      const detector = await window.ai.languageDetector.create();
      const results = await detector.detect(text);
      
      if (!results || results.length === 0) return undefined;
      
      const bestResult = results[0];
      const languageName = LANGUAGES.find(lang => lang.code === bestResult.detectedLanguage)?.name || bestResult.detectedLanguage;
      
      return {
        name: languageName,
        code: bestResult.detectedLanguage,
        confidence: bestResult.confidence
      };
    } catch (error) {
      console.error('Language detection error:', error);
      return undefined;
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to process');
      return;
    }

    const messageId = Date.now().toString();
    const newMessage: Message = {
      id: messageId,
      text: inputText,
      type: 'input'
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setError(null);

    // Detect language automatically
    const detectedLanguage = await detectLanguage(inputText);
    if (detectedLanguage !== undefined) {
      const outputMessage: Message = {
        id: `${messageId}-output`,
        text: inputText,
        type: 'output',
        detectedLanguage,
        showSummarize: detectedLanguage.code === 'en' && inputText.length > 150
      };
      setMessages(prev => [...prev, outputMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextProcess = async (type: ProcessingType, messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    setError(null);
    setIsProcessing((prev) => ({ ...prev, [type as string]: true }));

    try {
      let processedText = '';
      if (type === 'translate' && window.ai?.translator) {
        try {
          // Check if the target language is supported
          console.log('Checking language pair availability...');
          const translatorCapabilities = await window.ai.translator.capabilities();
          
          // First try with 'auto' as source
          const autoAvailability = await translatorCapabilities.languagePairAvailable('auto', targetLanguage);
          console.log(`Availability for auto to ${targetLanguage}:`, autoAvailability);

          if (autoAvailability === 'no') {
            // Try with specific source language pairs
            const sourceLanguages = ['en', 'es', 'fr', 'de', 'it'];
            let supported = false;
            let bestSourceLanguage = 'en'; // default fallback

            for (const sourceLanguage of sourceLanguages) {
              const availability = await translatorCapabilities.languagePairAvailable(sourceLanguage, targetLanguage);
              console.log(`Availability for ${sourceLanguage} to ${targetLanguage}:`, availability);
              if (availability !== 'no') {
                supported = true;
                bestSourceLanguage = sourceLanguage;
                break;
              }
            }

            if (!supported) {
              throw new Error(`Translation to ${targetLanguage} is not supported yet. Please try a different language.`);
            }

            // Create a translator with the best available source language
            console.log(`Creating translator with source language: ${bestSourceLanguage}`);
            const translatorInstance = await window.ai.translator.create({
              sourceLanguage: bestSourceLanguage,
              targetLanguage,
              monitor(m) {
                m.addEventListener('downloadprogress', ((e: Event) => {
                  const progressEvent = e as DownloadProgressEvent;
                  console.log(`Downloading language model: ${progressEvent.loaded}/${progressEvent.total} bytes`);
                  setDownloadStatus({
                    isDownloading: true,
                    progress: progressEvent.loaded,
                    total: progressEvent.total,
                    type: 'translator'
                  });
                }) as EventListener);
              },
            });

            // Wait for the translator to be ready if needed
            if (translatorInstance.ready) {
              console.log('Waiting for translator to be ready...');
              await translatorInstance.ready;
            }

            console.log('Translating text...');
            const translatedText = await translatorInstance.translate(message.text);
            console.log('Translation completed');
            
            processedText = translatedText;
            
            // After translation, add new message with detected language
            const detectedLanguage = await detectLanguage(processedText);
            const newMessage: Message = {
              id: `${messageId}-translated`,
              text: processedText,
              type: 'output',
              detectedLanguage,
              showSummarize: detectedLanguage?.code === 'en' && processedText.length > 150
            };
            setMessages(prev => [...prev, newMessage]);
          } else {
            // Auto detection is supported, use it
            console.log('Creating translator with auto detection...');
            const translatorInstance = await window.ai.translator.create({
              sourceLanguage: 'auto',
              targetLanguage,
              monitor(m) {
                m.addEventListener('downloadprogress', ((e: Event) => {
                  const progressEvent = e as DownloadProgressEvent;
                  console.log(`Downloading language model: ${progressEvent.loaded}/${progressEvent.total} bytes`);
                  setDownloadStatus({
                    isDownloading: true,
                    progress: progressEvent.loaded,
                    total: progressEvent.total,
                    type: 'translator'
                  });
                }) as EventListener);
              },
            });

            if (translatorInstance.ready) {
              console.log('Waiting for translator to be ready...');
              await translatorInstance.ready;
            }

            console.log('Translating text...');
            const translatedText = await translatorInstance.translate(message.text);
            console.log('Translation completed');
            
            processedText = translatedText;
            
            // After translation, add new message with detected language
            const detectedLanguage = await detectLanguage(processedText);
            const newMessage: Message = {
              id: `${messageId}-translated`,
              text: processedText,
              type: 'output',
              detectedLanguage,
              showSummarize: detectedLanguage?.code === 'en' && processedText.length > 150
            };
            setMessages(prev => [...prev, newMessage]);
          }
        } catch (translationError) {
          throw new Error(
            translationError instanceof Error 
              ? translationError.message 
              : 'Failed to translate text. Please try again.'
          );
        }
      } else if (type === 'summarize' && summarizer) {
        try {
          const summary = await summarizer.summarize(message.text);
          processedText = cleanMarkdownFormatting(summary);
          
          const detectedLanguage = await detectLanguage(processedText);
          const newMessage: Message = {
            id: `${messageId}-summarized`,
            text: processedText,
            type: 'output',
            detectedLanguage,
            showSummarize: false
          };
          setMessages(prev => [...prev, newMessage]);
        } catch {
          throw new Error('Failed to generate summary. Please try with different text or try again later.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
    } finally {
      setIsProcessing((prev) => ({ ...prev, [type as string]: false }));
    }
  };

  return (
    <main className="container mx-auto p-4 max-w-4xl h-screen flex flex-col">
      <h1 className="text-4xl font-bold mb-4 text-center">AI Text Processor</h1>
      
      {downloadStatus.isDownloading && downloadStatus.type === 'summarizer' && (
        <Card className="p-6 mb-4 bg-blue-50 border-blue-200">
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
        <Card className="p-6 mb-4 bg-yellow-50 border-yellow-200">
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
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold mb-2">Additional Resources</h3>
            <p className="text-sm text-gray-600 mb-4">Note: You may need to turn on experimental feature flags in your Chrome browser to access these native AI APIs.</p>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://developer.chrome.com/docs/ai/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Chrome AI APIs Overview
                </a>
              </li>
              <li>
                <a href="https://developer.chrome.com/docs/ai/summarizer-api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Summarizer API Documentation
                </a>
              </li>
              <li>
                <a href="https://developer.chrome.com/docs/ai/translator-api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Translator API Documentation
                </a>
              </li>
              <li>
                <a href="https://developer.chrome.com/docs/ai/language-detection" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Language Detection API Documentation
                </a>
              </li>
              <li>
                <a href="https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Asynchronous JavaScript Handling
                </a>
              </li>
            </ul>
          </div>
        </Card>
      )}
      
      <Card className="flex-1 p-6 shadow-lg mb-4 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto mb-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'input' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${
                message.type === 'input' 
                  ? 'bg-blue-500 text-white rounded-l-lg rounded-tr-lg' 
                  : 'bg-gray-100 rounded-r-lg rounded-tl-lg'
              } p-4`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
                
                {message.detectedLanguage && (
                  <p className="text-sm mt-2 text-gray-600">
                    Language: {message.detectedLanguage.name} 
                    ({Math.round(message.detectedLanguage.confidence * 100)}% confidence)
                  </p>
                )}
                
                {message.type === 'output' && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {message.showSummarize && (
              <Button
                        size="sm"
                        onClick={() => handleTextProcess('summarize', message.id)}
                        disabled={isProcessing.summarize}
              >
                {isProcessing.summarize ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Summarizing...
                  </>
                ) : (
                  'Summarize'
                )}
              </Button>
                    )}
              <Button
                      size="sm"
                      onClick={() => handleTextProcess('translate', message.id)}
                      disabled={isProcessing.translate}
              >
                {isProcessing.translate ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Translating...
                  </>
                ) : (
                  'Translate'
                )}
              </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="text-red-500 text-center p-4 mb-4" role="alert">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:flex-1">
            <Textarea
              placeholder="Type your message..."
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="min-h-[100px]"
            />
          </div>
          <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
              <Select
                value={targetLanguage}
                onValueChange={setTargetLanguage}
              >
              <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            <Button 
              onClick={handleSend}
              className="w-full sm:w-[150px]"
              disabled={!inputText.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
