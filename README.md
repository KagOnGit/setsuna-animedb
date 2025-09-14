# AnimeDB Website

A Next.js application featuring Setsuna, a tsundere vampire character with AI chat and TTS capabilities.

## Environment Setup

Create a `.env.local` file with the following variables:

```bash
# LLM Provider (openai or gemini)
LLM_PROVIDER=openai

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
# If your key starts with sk-proj- set your Project ID too:
OPENAI_PROJECT=your_project_id
OPENAI_MODEL=gpt-4o-mini

# Google Gemini Configuration
GOOGLE_API_KEY=your_google_api_key
GEMINI_MODEL=gemini-1.5-flash

# ElevenLabs TTS Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVEN_VOICE_ID=Serafina
ELEVEN_MODEL_ID=eleven_multilingual_v2
```

### Project-Scoped Keys

If your OpenAI API key starts with `sk-proj-`, you must also set the `OPENAI_PROJECT` environment variable to your project ID. This ensures proper quota and permission handling.

### Using Google Gemini

To use Google Gemini instead of OpenAI:

1. Set `LLM_PROVIDER=gemini` in your environment
2. Get a Google API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Set `GOOGLE_API_KEY=your_api_key`
4. Optionally set `GEMINI_MODEL=gemini-1.5-flash` (default)

**Note**: In development, browser SpeechSynthesis may be used as a fallback when ElevenLabs is unavailable to keep lip-sync working. In production, ElevenLabs is always used and the browser fallback is disabled.

### Protected Preview

When using Vercel's protected preview feature, TTS will be locked until unlocked:

1. **Create bypass token**: In Vercel dashboard, create a bypass token for your project
2. **Set environment variable**: Add `NEXT_PUBLIC_VERCEL_BYPASS=your_token` (Preview only)
3. **Redeploy**: Deploy the updated environment variables
4. **Unlock TTS**: Visit `/?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=your_token` to unlock voice

The app will automatically detect protected preview and show an "Unlock voice" button when needed.

## Development

```bash
npm install
npm run dev
```

The application will be available at http://localhost:3000.

## Deploy

### Vercel Deployment

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Set Environment Variables** in Vercel dashboard:
   - `LLM_PROVIDER` - LLM provider (openai or gemini)
   - `OPENAI_API_KEY` - Your OpenAI API key (if using OpenAI)
   - `OPENAI_PROJECT` - Your OpenAI project ID (if using sk-proj- key)
   - `GOOGLE_API_KEY` - Your Google API key (if using Gemini)
   - `ELEVENLABS_API_KEY` - Your ElevenLabs API key
   - `ELEVEN_VOICE_ID` - Voice ID (default: Serafina)
   - `ELEVEN_MODEL_ID` - Model ID (default: eleven_multilingual_v2)
   - `NEXT_PUBLIC_VERCEL_BYPASS` - Optional. Preview-only Protection Bypass token

3. **Deploy**: Vercel will automatically build and deploy your application

### Required Environment Variables

- `LLM_PROVIDER` (required: "openai" or "gemini")
- `OPENAI_API_KEY` (required if using OpenAI)
- `OPENAI_PROJECT` (required if using sk-proj- key)
- `GOOGLE_API_KEY` (required if using Gemini)
- `ELEVENLABS_API_KEY` (required for premium TTS)

### Protected Preview

If your Vercel Preview deployments are protected, set `NEXT_PUBLIC_VERCEL_BYPASS` (Vercel → Settings → Security → Protection Bypass → Create Token). In protected previews, the app will show an “Unlock voice” button that sets the bypass cookie and unlocks ElevenLabs TTS. Do NOT set this in Production.

### Smoke Test Checklist

After deployment, verify these endpoints work:

- [ ] `/api/health` returns `{"openai":true,"gemini":true,"tts":true,"project":"ok","provider":"openai"}`
- [ ] Chat streams responses from Setsuna
- [ ] TTS plays voice when "Voice replies" is enabled
- [ ] Lips sync with TTS audio
- [ ] VRM model loads and displays correctly

## Health Checks

- `/api/health` - Overall system health
- `/api/health/openai` - OpenAI API status and project configuration
- `/api/health/tts` - ElevenLabs TTS status

## Features

- AI-powered chat with Setsuna character
- Text-to-speech with ElevenLabs
- Real-time streaming responses
- Project-scoped OpenAI key support
- Health monitoring and diagnostics
- VRM avatar with lip-sync
