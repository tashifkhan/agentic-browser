# Environment Variables Setup

This project requires API keys to function properly. Follow these steps to set up your environment variables.

## ⚠️ Important Security Note

**NEVER commit `.env` files to git!** They contain sensitive API keys that should be kept secret.

## Authentication Setup

### Google OAuth (Required for Google Sign-In)
See main setup instructions below for Google OAuth configuration.

### GitHub OAuth (Optional)
For GitHub sign-in support, see **[GITHUB_OAUTH_SETUP.md](./GITHUB_OAUTH_SETUP.md)** for detailed instructions.

## Setup Instructions

### 1. Backend Environment (`himanshu/.env`)

Copy the example file and add your API key:

```bash
cd himanshu
cp .env.example .env
```

Edit `himanshu/.env` and add your Groq API key:

```env
GROQ_API_KEY=your_actual_groq_api_key_here
```

### 2. Agent Environment (`himanshu/agents/.env`)

Copy the example file and configure LangSmith + Groq:

```bash
cd himanshu/agents
cp .env.example .env
```

Edit `himanshu/agents/.env` with your credentials:

```env
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your_actual_langsmith_key_here
LANGSMITH_PROJECT=your_project_name
GROQ_API_KEY=your_actual_groq_api_key_here
```

## Getting API Keys

### Groq API Key
1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy and paste into your `.env` files

### LangSmith API Key (Optional - for tracing)
1. Visit [https://smith.langchain.com](https://smith.langchain.com)
2. Sign up or log in
3. Go to Settings → API Keys
4. Create a new API key
5. Copy and paste into `himanshu/agents/.env`

## Verification

After setting up your `.env` files, verify they are not tracked by git:

```bash
git status
```

You should **NOT** see any `.env` files in the output. If you do, they were accidentally added to git.

## Troubleshooting

If you accidentally committed `.env` files:
1. Remove them from git: `git rm --cached <file>`
2. Commit the change
3. Regenerate all exposed API keys immediately
4. Update your local `.env` files with the new keys

## Security Best Practices

✅ **DO:**
- Keep `.env` files in `.gitignore`
- Use `.env.example` files as templates
- Regenerate keys if they are exposed
- Use different keys for development and production

❌ **DON'T:**
- Commit `.env` files to version control
- Share API keys via email or chat
- Use production keys in development
- Hard-code API keys in source code
