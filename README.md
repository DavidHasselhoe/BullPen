# BullPen

A modern, real-time portfolio dashboard for Nordnet accounts.

## Features

- Real-time portfolio overview with multiple accounts
- Market status indicators (US 🇺🇸 and Norwegian 🇳🇴 markets)
- Live exchange rates
- Modern, animated UI with blur effects
- Responsive design

## Prerequisites

- Node.js 18+ (or Docker)
- Nordnet API credentials
- Alpha Vantage API key (free tier available)
- Finnhub API key (optional)

## Quick Start with Docker

1. Clone the repository:
```bash
git clone https://github.com/DavidHasselhoe/BullPen.git
cd project-nordnetAPI
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Edit `.env` and add your API keys:
```
ALPHA_VANTAGE_API_KEY=your_key_here
FINNHUB_API_KEY=your_key_here
PORT=3000
```

4. Build and run with Docker:
```bash
docker build -t nordnet-dashboard .
docker run -p 3000:3000 --env-file .env nordnet-dashboard
```

5. Open http://localhost:3000 in your browser

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create and configure `.env` file (see above)

3. Start the server:
```bash
npm start
```

## API Keys

### Alpha Vantage (Required)
- Get a free API key at https://www.alphavantage.co/support/#api-key
- Used for US market status and exchange rates

### Finnhub (Optional)
- Get a free API key at https://finnhub.io/register
- Currently not actively used but available for future features

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key | Yes |
| `FINNHUB_API_KEY` | Finnhub API key | No |
| `PORT` | Server port (default: 3000) | No |

## Project Structure

```
.
├── app.js                  # Main server file
├── server/
│   └── api/
│       ├── exchangeRates.js   # Exchange rate endpoint
│       └── marketStatus.js    # Market status endpoint
├── client/
│   └── static/
│       ├── index.html         # Main HTML
│       ├── main-new.js        # Frontend JavaScript
│       └── styles.css         # Styles and animations
├── Dockerfile             # Docker configuration
└── .env.example          # Environment variables template
```

