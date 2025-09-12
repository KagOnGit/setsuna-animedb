# AnimeDB Website

A Next.js application featuring Setsuna, a tsundere vampire character with AI chat and TTS capabilities.

## Environment Setup

Create a `.env.local` file with the following variables:

```bash
OPENAI_API_KEY=your_openai_api_key
# If your key starts with sk-proj- set your Project ID too:
OPENAI_PROJECT=your_project_id
OPENAI_MODEL=gpt-4o-mini

ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVEN_VOICE_ID=Serafina
ELEVEN_MODEL_ID=eleven_multilingual_v2
```

### Project-Scoped Keys

If your OpenAI API key starts with `sk-proj-`, you must also set the `OPENAI_PROJECT` environment variable to your project ID. This ensures proper quota and permission handling.

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
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `OPENAI_PROJECT` - Your OpenAI project ID (if using sk-proj- key)
   - `ELEVENLABS_API_KEY` - Your ElevenLabs API key
   - `ELEVEN_VOICE_ID` - Voice ID (default: Serafina)
   - `ELEVEN_MODEL_ID` - Model ID (default: eleven_multilingual_v2)

3. **Deploy**: Vercel will automatically build and deploy your application

### Required Environment Variables

- `OPENAI_API_KEY` (required)
- `OPENAI_PROJECT` (required if using sk-proj- key)
- `ELEVENLABS_API_KEY` (required)

### Smoke Test Checklist

After deployment, verify these endpoints work:

- [ ] `/api/health` returns `{"openai":true,"tts":true,"project":"ok"}`
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
