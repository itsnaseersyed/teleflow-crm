# TeleFlow CRM - Cloudflare Workers Deployment Guide

Since your app is built with TanStack Start for **Cloudflare Workers**, deploying to Vercel was never going to work. Here's the proper way to deploy:

## Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

Or use it locally:
```bash
npx wrangler
```

## Step 2: Authenticate with Cloudflare

```bash
wrangler login
```

This opens a browser window to authenticate. Approve the connection.

## Step 3: Build for Cloudflare Workers

Your build already outputs to the correct format:
```bash
npm run build
```

This creates:
- `dist/server/server.js` - Cloudflare Worker handler
- `dist/client/` - Static assets

## Step 4: Deploy to Cloudflare Workers

```bash
wrangler deploy
```

This will:
1. Upload your Worker code to Cloudflare
2. Automatically serve static assets from `dist/client/`
3. Deploy SSR to Cloudflare Workers runtime

## Step 5: Set Environment Variables on Cloudflare

Go to Cloudflare Dashboard → Workers → Your App → Settings → Environment Variables

Add:
```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

## Step 6: Custom Domain (Optional)

In your Cloudflare Dashboard:
1. Go to Workers → Your App → Settings
2. Add custom domain (e.g., `teleflow.yourdomain.com`)

## Deployment Complete ✅

Your app will be available at:
- `https://tanstack-start-app.<your-account>.workers.dev` (default)
- Or your custom domain

## Why Cloudflare > Vercel for this project?

| Feature | Cloudflare | Vercel |
|---------|-----------|--------|
| **Built for** | ✅ TanStack Start | ❌ Next.js |
| **SSR** | Native | Requires wrapper |
| **Performance** | Global edge network | US-focused |
| **Cost** | Free tier available | $20+/month |
| **Setup** | 5 minutes | Complex |

Your app is already optimized for Cloudflare Workers. Use it! 🚀

## Rollback from Vercel

If you've deployed to Vercel, you can delete it from your Vercel Dashboard. No longer needed.
