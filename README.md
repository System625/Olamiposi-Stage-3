# AI Text Processor

A powerful text processing application built with Next.js that leverages Chrome's native AI APIs for text summarization, translation, and language detection. The application provides a modern, user-friendly interface for processing text with advanced AI capabilities.

## Features

- **Text Summarization**: Generate concise summaries of long texts while maintaining important details and context
- **Language Translation**: Translate text between multiple languages
- **Language Detection**: Automatically detect the language of input text
- **Real-time Processing**: Process text in real-time with immediate feedback
- **Modern UI**: Clean and responsive interface built with modern design principles

## Prerequisites

- Google Chrome browser (required for AI APIs)
- Node.js 18.17.0 or later
- npm, yarn, or pnpm for package management

## Setup Instructions

1. Clone the repository:
```bash
git clone [repository-url]
cd text-processor
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Enable Chrome AI Features:
   - Open `chrome://flags` in your Chrome browser
   - Enable the following flags:
     - "Experimental AI features"
     - "AI Summarization"
     - "Translation API"
     - "Language Detection API"
   - Restart Chrome after enabling these flags

4. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) with Chrome to use the application

## Troubleshooting for Low-Spec Systems

If you encounter the error "The device is not eligible for running on-device model", follow these steps:

1. Enable Optimization Guide:
   - Go to `chrome://flags/`
   - Find "Optimization Guide On Device"
   - Set it to "Enabled ByPassPerfRequirement"
   - Restart Chrome

2. Download Required Components:
   - Navigate to `chrome://components/`
   - Look for "Optimization Guide On Device Model" (version 0.0.0.0)
   - Click to download the component

3. Verify API Support:
   ```javascript
   if ('ai' in self && 'summarizer' in self.ai) {
     // The Summarizer API is supported
   }
   ```

4. Monitor Download Progress:
   The application automatically tracks model download progress. You can monitor it in the browser console:
   ```javascript
   const summarizer = await ai.summarizer.create({
     monitor(m) {
       m.addEventListener('downloadprogress', (e) => {
         console.log(`Downloaded ${e.loaded} of ${e.total} bytes.`);
       });
     }
   });
   ```

## Usage

1. Type or paste your text in the input area
2. For translation:
   - Select the target language from the dropdown
   - Click the "Translate" button
3. For summarization:
   - Enter text longer than 150 characters
   - Click the "Summarize" button when available
4. The application will automatically detect the input language

## Technical Details

- Built with Next.js 14
- Uses Chrome's native AI APIs for processing
- Implements real-time language detection
- Supports multiple language pairs for translation
- Provides progress tracking for model downloads

## Browser Compatibility

This application requires Google Chrome with experimental AI features enabled. Other browsers are not supported at this time due to the dependency on Chrome's native AI APIs.

## Learn More

- [Chrome AI APIs Overview](https://developer.chrome.com/docs/ai/)
- [Summarizer API Documentation](https://developer.chrome.com/docs/ai/summarizer-api)
- [Translator API Documentation](https://developer.chrome.com/docs/ai/translator-api)
- [Language Detection API Documentation](https://developer.chrome.com/docs/ai/language-detection)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

