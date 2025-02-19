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
import Bowser from "bowser";

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
  type: 'summarizer' | 'translator' | null;
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
  originalText?: string;
};

// Add new utility functions
const checkOnlineStatus = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retryOperation = async <T,>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 5000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await delay(delayMs);
      }
    }
  }
  
  throw lastError;
};

// Replace the browser detection utility with bowser
const getBrowserInfo = () => {
  if (typeof window === 'undefined') return { name: 'unknown', isMobile: false };
  
  const browser = Bowser.getParser(window.navigator.userAgent);
  const platformType = browser.getPlatformType();
  
  return { 
    name: browser.getBrowserName().toLowerCase(),
    isMobile: platformType === 'mobile' || platformType === 'tablet',
    version: browser.getBrowserVersion(),
    os: browser.getOSName().toLowerCase(),
    platform: platformType
  };
};

// Add type definition for Brave browser's navigator
interface BraveNavigator extends Navigator {
  brave?: {
    isBrave?: () => Promise<boolean>;
  };
}

// Update browser detection utility with proper typing
const isBraveBrowser = async (): Promise<boolean> => {
  try {
    const braveNavigator = navigator as BraveNavigator;
    return !!(braveNavigator.brave && await braveNavigator.brave.isBrave?.());
  } catch {
    return false;
  }
};

// Update browser compatibility check with proper typing
const checkBrowserCompatibility = async () => {
  const browserInfo = getBrowserInfo();
  
  // Chrome desktop on Windows, Mac, or Linux
  if (browserInfo.name === 'chrome' && !browserInfo.isMobile) {
    // Check if it's actually Brave
    const isBrave = await isBraveBrowser();
    if (isBrave) {
      return { 
        compatible: false, 
        message: 'Brave browser is not supported. The AI features require Google Chrome desktop browser with experimental features enabled.' 
      };
    }
    return { compatible: true, message: null };
  }
  
  // Chrome on mobile/tablet
  if (browserInfo.name === 'chrome' && browserInfo.isMobile) {
    return { 
      compatible: false, 
      message: `Chrome ${browserInfo.platform} is not supported. The AI features require desktop Chrome browser with experimental features enabled. Please use a desktop computer with Chrome browser.` 
    };
  }
  
  return { 
    compatible: false, 
    message: `${browserInfo.name.charAt(0).toUpperCase() + browserInfo.name.slice(1)} browser on ${browserInfo.platform} is not supported. Please use Google Chrome desktop browser and enable experimental AI features:
    1. Open chrome://flags in Chrome
    2. Enable "Experimental AI features"
    3. Enable "AI Summarization"
    4. Enable "Translation API"
    5. Enable "Language Detection API"
    6. Restart Chrome`
  };
};

export default function Home() {
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    text: "👋 Welcome to AI Text Processor! I can help you with:\n\n• Translating text between multiple languages\n• Summarizing long English text into key points\n• Automatically detecting the language of your text\n\nJust type your text in the box below and I'll help you process it!",
    type: 'output'
  }]);
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
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>({
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
      // Check browser compatibility first
      const { compatible, message } = await checkBrowserCompatibility();
      if (!compatible) {
        setError(message);
        return;
      }

      // Check online status
      if (!checkOnlineStatus()) {
        setError('You are currently offline. Please check your internet connection.');
        return;
      }

      // First check if the API is supported
      if (!('ai' in window) || !window.ai?.summarizer) {
        setError(`The AI features are not available. Please ensure you:
          1. Are using Google Chrome desktop browser
          2. Have enabled experimental AI features in chrome://flags
          3. Have restarted Chrome after enabling the flags`);        
        return;
      }

      try {
        // Type assertion to handle the possibly undefined window.ai
        const ai = window.ai as NonNullable<typeof window.ai>;
        const { available } = await ai.summarizer.capabilities();        
        
        if (available === 'no') {
          setError('Summarizer API is not usable on this device. Please check Chrome flags and ensure your device meets the requirements.');
          return;
        }

        if (available === 'after-download') {
          // Ask for user consent before downloading
          const startDownload = window.confirm(
            'The summarizer model needs to be downloaded (size: ~3GB). This will be a one-time download. Do you want to proceed?'
          );
          
          if (!startDownload) {
            setError('Model download cancelled by user. Some features will be unavailable.');
            return;
          }
        }

        // Try to create the summarizer instance with progress monitoring and retry mechanism
        try {
          const createSummarizerWithRetry = async () => {
            const summarizerInstance = await ai.summarizer.create({
              type: 'key-points' as const,
              format: 'markdown' as const,
              length: 'medium' as const,
              sharedContext: 'Summarize the following text into key points, maintaining important details and context.',
              monitor(m) {
                // Add network status check to download progress
                window.addEventListener('offline', () => {
                  setError('Network connection lost. Download paused.');
                });
                
                window.addEventListener('online', () => {
                  setError(null);
                });
                
                m.addEventListener('downloadprogress', ((e: Event) => {
                  const progressEvent = e as DownloadProgressEvent;                
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
              await retryOperation(
                async () => {
                  if (!checkOnlineStatus()) {
                    throw new Error('Network connection lost');
                  }
                  await summarizerInstance.ready;
                },
                3, // max retries
                5000 // delay between retries
              );
            }
            
            return summarizerInstance;
          };

          const summarizerInstance = await createSummarizerWithRetry();
          
          setDownloadStatus(prev => ({ ...prev, isDownloading: false, type: null }));
          setSummarizer(summarizerInstance);
          setApiAvailability((prev: APIAvailability) => ({ ...prev, summarizer: true }));
        } catch (error) {
          if (!checkOnlineStatus()) {
            setError('Network connection lost during setup. Please check your internet connection and try again.');
          } else {
            setError(
              error instanceof Error 
                ? `Failed to initialize summarizer: ${error.message}` 
                : 'Failed to create summarizer instance. Please try again.'
            );
          }
        }
      } catch (error) {
        setError(
          error instanceof Error 
            ? `Failed to initialize Summarizer API: ${error.message}` 
            : 'Failed to initialize Summarizer API. Please ensure Chrome flags are enabled and restart browser.'
        );
      }
    };

    initializeSummarizer();
  }, []);


  useEffect(() => {
    const initializeTranslator = async () => {
      // Check browser compatibility first
      const { compatible, message } = await checkBrowserCompatibility();
      if (!compatible) {
        setError(message);
        return;
      }

      // Check online status
      if (!checkOnlineStatus()) {
        setError('You are currently offline. Please check your internet connection.');
        return;
      }

      try {
        // Check if the APIs are supported
        const hasTranslator = 'ai' in window && 'translator' in (window.ai || {});
        const hasLanguageDetector = 'ai' in window && 'languageDetector' in (window.ai || {});

        if (!hasTranslator || !window.ai?.translator) {
          throw new Error(`The AI features are not available. Please ensure you:
            1. Are using Google Chrome desktop browser
            2. Have enabled experimental AI features in chrome://flags
            3. Have restarted Chrome after enabling the flags`);
        }

        // Initialize translator
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
          await initialTranslator.ready;
        }

        setApiAvailability(prev => ({ ...prev, translator: true }));
        
        // Initialize language detector if available
        if (hasLanguageDetector && window.ai?.languageDetector) {
          try {
            const { available } = await window.ai.languageDetector.capabilities();
            
            if (available === 'no') {
              return;
            }

            const detector = await window.ai.languageDetector.create({
              monitor(m) {
                m.addEventListener('downloadprogress', ((e: Event) => {
                  const progressEvent = e as DownloadProgressEvent;
                  console.log(`Downloaded detector: ${progressEvent.loaded} of ${progressEvent.total} bytes.`);
                }) as EventListener);
              },
            });

            if (available === 'after-download' && detector.ready) {
              await detector.ready;
            }

            // Test the detector
            const testResult = await detector.detect('Hello, world!');
            if (testResult && testResult.length > 0) {
              setApiAvailability(prev => ({ ...prev, languageDetector: true }));
            }
          } catch {
            // Silently handle language detector errors as it's not critical
          }
        }
        
        setDownloadStatus(prev => ({ ...prev, isDownloading: false, type: null }));
      } catch (error) {
        setError(
          error instanceof Error 
            ? error.message 
            : 'Failed to initialize APIs. Please switch to Google Chrome desktop and enable the required experimental flags.'
        );
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
    } catch {      
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

    // Store the original message ID to track translations
    const originalMessageId = messageId.endsWith('-translated') 
      ? messageId.replace('-translated', '')
      : messageId;
    
    const originalMessage = messages.find(m => m.id === originalMessageId);
    const textToProcess = originalMessage ? originalMessage.text : message.text;

    if (!checkOnlineStatus()) {
      setError('You are currently offline. Please check your internet connection.');
      return;
    }

    setError(null);
    setIsProcessing((prev) => ({ ...prev, [type as string]: true }));

    try {
      let processedText = '';
      if (type === 'translate' && window.ai?.translator) {
        try {
          // Check if the target language is supported
          const translatorCapabilities = await window.ai.translator.capabilities();
          
          // First try with 'auto' as source
          const autoAvailability = await translatorCapabilities.languagePairAvailable('auto', targetLanguage);

          if (autoAvailability === 'no') {
            // Try with specific source language pairs
            const sourceLanguages = ['en', 'es', 'fr', 'de', 'it'];
            let supported = false;
            let bestSourceLanguage = 'en'; // default fallback

            for (const sourceLanguage of sourceLanguages) {
              const availability = await translatorCapabilities.languagePairAvailable(sourceLanguage, targetLanguage);
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
            const translatorInstance = await window.ai.translator.create({
              sourceLanguage: bestSourceLanguage,
              targetLanguage,
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

            // Wait for the translator to be ready if needed
            if (translatorInstance.ready) {
              await translatorInstance.ready;
            }

            const translatedText = await translatorInstance.translate(textToProcess);
            
            processedText = translatedText;
            
            // After translation, add new message with detected language
            const detectedLanguage = await detectLanguage(processedText);
            const newMessage: Message = {
              id: `${originalMessageId}-translated`,
              text: processedText,
              type: 'output',
              detectedLanguage,
              showSummarize: detectedLanguage?.code === 'en' && processedText.length > 150,
              originalText: textToProcess // Store the original text
            };
            
            // Remove previous translation if it exists
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== `${originalMessageId}-translated`);
              return [...filtered, newMessage];
            });
          } else {
            // Auto detection is supported, use it
            const translatorInstance = await window.ai.translator.create({
              sourceLanguage: 'auto',
              targetLanguage,
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

            if (translatorInstance.ready) {
              await translatorInstance.ready;
            }

            const translatedText = await translatorInstance.translate(textToProcess);
            
            processedText = translatedText;
            
            // After translation, add new message with detected language
            const detectedLanguage = await detectLanguage(processedText);
            const newMessage: Message = {
              id: `${originalMessageId}-translated`,
              text: processedText,
              type: 'output',
              detectedLanguage,
              showSummarize: detectedLanguage?.code === 'en' && processedText.length > 150,
              originalText: textToProcess // Store the original text
            };
            
            // Remove previous translation if it exists
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== `${originalMessageId}-translated`);
              return [...filtered, newMessage];
            });
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
          const summary = await retryOperation(
            async () => {
              if (!checkOnlineStatus()) {
                throw new Error('Network connection lost');
              }
              return await summarizer.summarize(message.text);
            },
            3, // max retries
            5000 // delay between retries
          );
          
          processedText = cleanMarkdownFormatting(summary);
          
          const detectedLanguage = await detectLanguage(processedText);
          const newMessage: Message = {
            id: `${originalMessageId}-summarized`,
            text: processedText,
            type: 'output',
            detectedLanguage,
            showSummarize: false
          };
          setMessages(prev => [...prev, newMessage]);
        } catch (error) {
          throw new Error(
            error instanceof Error 
              ? `Failed to generate summary: ${error.message}` 
              : 'Failed to generate summary. Please try with different text or try again later.'
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
    } finally {
      setIsProcessing((prev) => ({ ...prev, [type as string]: false }));
    }
  };

  return (
    <main className="container mx-auto p-4 max-w-4xl min-h-screen flex flex-col">
      <h1 className="text-4xl font-bold mb-4 text-center">AI Text Processor</h1>
      
      <div className="space-y-4 mb-4">
        {error && (
          <Card className="p-6 bg-red-50 border-red-200">
            <h2 className="text-lg font-semibold mb-4 text-red-700">Error</h2>
            <p className="text-red-600">{error}</p>
          </Card>
        )}

        {downloadStatus.isDownloading && downloadStatus.type === 'summarizer' && (
          <Card className="p-6 bg-blue-50 border-blue-200">
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
          <Card className="p-6 bg-yellow-50 border-yellow-200">
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
              </ul>
            </div>
          </Card>
        )}
      </div>
      
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
