# GitHub OAuth Setup Guide

## Overview
This guide will help you set up GitHub OAuth authentication for the Open DIA extension.

## Prerequisites
- A GitHub account
- Backend service running on `http://localhost:5000`

## Setup Steps

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the application details:
   - **Application name**: `Open DIA Extension` (or your preferred name)
   - **Homepage URL**: `http://localhost:5000` (or your domain)
   - **Authorization callback URL**: Get this from your extension's redirect URI
     - Chrome: `https://<extension-id>.chromiumapp.org/`
     - Firefox: `https://<extension-id>.extensions.allizom.org/`
     - To get your extension ID, check `chrome://extensions` or `about:debugging`
   - **Application description**: Optional description

4. Click **"Register application"**

### 2. Get Your Credentials

After creating the app:
1. Copy the **Client ID**
2. Click **"Generate a new client secret"**
3. Copy the **Client Secret** (you won't be able to see it again!)

### 3. Configure Backend

1. Navigate to `Extension/` directory:
   ```bash
   cd Extension
   ```

2. Create or update your `.env` file:
   ```bash
   # If you don't have .env, copy from .env.example
   cp .env.example .env
   ```

3. Add your GitHub credentials to `.env`:
   ```env
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```

### 4. Update Extension Redirect URI (if needed)

If you used a placeholder for the callback URL:

1. Load your extension in the browser
2. Get the actual redirect URI from the browser console when testing auth
3. Go back to your [GitHub OAuth App settings](https://github.com/settings/developers)
4. Update the **Authorization callback URL** with the correct URI

### 5. Start Backend Service

```bash
cd Extension
python backend_service.py
```

You should see:
```
✅ Backend service starting on http://localhost:5000
```

## Testing GitHub Login

1. Load the extension in your browser
2. Open the extension sidepanel
3. Click **"Sign in with GitHub"**
4. Authorize the application in the GitHub popup
5. You should be redirected back and logged in!

## Troubleshooting

### "GitHub OAuth not configured" error
- Make sure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set in `.env`
- Restart the backend service after updating `.env`

### "Authentication cancelled" error
- Make sure you clicked "Authorize" in the GitHub popup
- Check if the Authorization callback URL matches your extension's redirect URI

### "Token exchange failed" error
- Verify your Client Secret is correct
- Check if the backend service is running
- Look at backend logs for detailed error messages

### "Invalid redirect_uri" error
- The callback URL in GitHub settings must exactly match your extension's redirect URI
- Get the correct URI from `browser.identity.getRedirectURL()` (logged in console)

## Security Notes

⚠️ **IMPORTANT**: Never commit your `.env` file to version control!

- The `.env` file is already in `.gitignore`
- Only commit `.env.example` with placeholder values
- Regenerate secrets immediately if accidentally exposed

## GitHub OAuth Scopes

The extension requests these scopes:
- `read:user` - Read user profile information
- `user:email` - Access user email addresses

These minimal scopes are used only for authentication and profile display.

## Additional Resources

- [GitHub OAuth Documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Browser Extension Identity API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity)
- [OAuth 2.0 Security Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)
