# Deploy Signaling Server to Render.com

## Quick Deploy Steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit - WebRTC signaling server"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Deploy on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `webrtc-signaling` (or your choice)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node signaling-server.js`
   - **Plan**: Free (or paid for better performance)

5. Add Environment Variable:
   - Key: `NODE_ENV`
   - Value: `production`

6. Click **"Create Web Service"**

### 3. Get Your WebSocket URL

After deployment, Render will give you a URL like:
```
https://webrtc-signaling-abc123.onrender.com
```

Your WebSocket URL will be:
```
wss://webrtc-signaling-abc123.onrender.com
```

### 4. Update Frontend

Update your `.env` file:
```env
VITE_SIGNALING_URL=wss://webrtc-signaling-abc123.onrender.com
```

Or update `src/main.js` directly:
```javascript
const SIGNALING_URL = 'wss://webrtc-signaling-abc123.onrender.com';
```

### 5. Test Your Deployment

Visit your Render URL in a browser:
```
https://webrtc-signaling-abc123.onrender.com/health
```

You should see:
```json
{
  "status": "ok",
  "service": "webrtc-signaling",
  "uptime": 123.45,
  "rooms": 0,
  "timestamp": "2024-12-09T..."
}
```

## Important Notes

### Free Tier Limitations
- Render free tier spins down after 15 minutes of inactivity
- First connection after spin-down takes ~30 seconds
- Consider upgrading to paid tier for production use

### Keep-Alive (Optional)
To prevent spin-down, you can ping the health endpoint every 10 minutes:
```bash
# Using cron-job.org or similar service
curl https://webrtc-signaling-abc123.onrender.com/health
```

### Monitoring
- Check logs in Render Dashboard → Your Service → Logs
- Monitor health endpoint for uptime
- Watch for connection errors

### Security (Production)
Consider adding:
- Rate limiting
- Authentication tokens
- CORS restrictions
- Room size limits

## Troubleshooting

**Connection fails:**
- Check if service is running in Render dashboard
- Verify WebSocket URL uses `wss://` (not `ws://`)
- Check browser console for errors

**Slow first connection:**
- Normal on free tier (cold start)
- Upgrade to paid tier for instant connections

**WebSocket closes immediately:**
- Check Render logs for errors
- Verify PORT environment variable is used
- Ensure server listens on `0.0.0.0`

## Alternative: Deploy with render.yaml

Create `render.yaml` in your repo root (already created):
```yaml
services:
  - type: web
    name: webrtc-signaling
    env: node
    buildCommand: npm install
    startCommand: node signaling-server.js
    envVars:
      - key: NODE_ENV
        value: production
```

Then use Render's "Blueprint" feature to deploy automatically.
