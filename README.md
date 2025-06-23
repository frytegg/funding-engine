# Funding Rate Arbitrage Engine

A sophisticated TypeScript-based funding rate arbitrage engine supporting Bybit, Bitget, KuCoin, and Hyperliquid exchanges with a $5,000 capital allocation.

## Overview

This engine automatically identifies and executes funding rate arbitrage opportunities across multiple cryptocurrency exchanges. It monitors funding rates in real-time and executes delta-neutral strategies to profit from funding rate differences while maintaining risk management controls.

## Features

### Core Functionality
- **Multi-Exchange Support**: Bybit, Bitget, KuCoin, and Hyperliquid
- **Real-time Data Collection**: Continuous monitoring of funding rates and order book depth
- **Automated Analysis**: Identifies persistent funding rate arbitrage opportunities
- **Risk Management**: Built-in kill switches and position monitoring
- **Delta-Neutral Strategy**: Maintains market-neutral positions

### Safety Features
- **Kill Switches**: Automatic position closure on adverse conditions
- **Isolated Margin**: Never uses cross margin to limit risk
- **IOC Orders**: Immediate-Or-Cancel orders to avoid partial fills
- **Position Monitoring**: Real-time monitoring every 5-10 seconds
- **Liquidity Analysis**: Ensures sufficient order book depth

### Technical Features
- **TypeScript**: Fully typed for reliability and maintainability
- **Supabase Database**: Persistent storage for historical data and positions
- **Comprehensive Logging**: Structured logging with Winston
- **Rate Limiting**: Built-in API rate limiting for all exchanges
- **Error Handling**: Robust error handling and retry mechanisms

## Project Structure

```
funding-rate-arbitrage/
├── src/
│   ├── config/                  # Configuration files
│   │   ├── exchanges/           # Exchange-specific configs
│   │   ├── database.config.ts   # Database configuration
│   │   └── arbitrage.config.ts  # Main trading parameters
│   ├── exchanges/               # Exchange implementations
│   │   ├── interfaces/          # Exchange interface definition
│   │   ├── bybit/              # Bybit exchange implementation
│   │   ├── bitget/             # Bitget exchange implementation
│   │   ├── kucoin/             # KuCoin exchange implementation
│   │   └── hyperliquid/        # Hyperliquid exchange implementation
│   ├── services/               # Core business logic
│   │   ├── DataCollector.ts    # Real-time data collection
│   │   ├── ArbitrageAnalyzer.ts # Opportunity analysis
│   │   ├── OrderExecutor.ts    # Order execution (TODO)
│   │   ├── PositionMonitor.ts  # Position monitoring (TODO)
│   │   └── RiskManager.ts      # Risk management (TODO)
│   ├── database/               # Database layer
│   │   ├── supabase.client.ts  # Supabase client
│   │   └── models/             # Data models
│   ├── utils/                  # Utility functions
│   │   ├── symbolMapper.ts     # Symbol mapping between exchanges
│   │   ├── logger.ts           # Logging configuration
│   │   └── helpers.ts          # General utility functions
│   ├── types/                  # TypeScript type definitions
│   │   └── common.ts           # Common interfaces and types
│   └── index.ts                # Main application entry point
├── env.example                 # Environment variables template
├── package.json               # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- Supabase account
- Exchange API keys (testnet recommended for initial setup)

### 2. Installation

```bash
# Clone the repository
git clone <repository-url>
cd funding-rate-arbitrage

# Install dependencies
pnpm install

# Copy environment template
cp env.example .env
```

### 3. Environment Configuration

Edit `.env` file with your configuration:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Exchange API Keys (Use testnet for initial setup)
BYBIT_API_KEY=your_bybit_api_key
BYBIT_API_SECRET=your_bybit_api_secret
BYBIT_TESTNET=true

# Trading Configuration
TOTAL_CAPITAL=5000
MIN_ARB_BPS=30
MIN_FUNDING_RATE_THRESHOLD=0.4
ANALYSIS_WINDOW_HOURS=72
MAX_POSITION_SIZE_PER_EXCHANGE=1250

# Risk Management
NEAR_LIQUIDATION_PERCENT=15
MAX_DRAWDOWN_PERCENT=10
```

### 4. Database Setup

Set up the required tables in your Supabase database:

```sql
-- Funding rates history
CREATE TABLE funding_rates (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50),
  symbol VARCHAR(50),
  funding_rate DECIMAL(10, 8),
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order book snapshots
CREATE TABLE orderbook_depth (
  id SERIAL PRIMARY KEY,
  exchange VARCHAR(50),
  symbol VARCHAR(50),
  bid_depth JSONB,
  ask_depth JSONB,
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trade executions
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  strategy_id UUID,
  exchange VARCHAR(50),
  symbol VARCHAR(50),
  side VARCHAR(10),
  price DECIMAL(20, 8),
  quantity DECIMAL(20, 8),
  leverage INTEGER,
  order_type VARCHAR(20),
  status VARCHAR(20),
  fees DECIMAL(20, 8),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Active positions
CREATE TABLE positions (
  id SERIAL PRIMARY KEY,
  strategy_id UUID,
  exchange VARCHAR(50),
  symbol VARCHAR(50),
  side VARCHAR(10),
  entry_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8),
  leverage INTEGER,
  liquidation_price DECIMAL(20, 8),
  tp_price DECIMAL(20, 8),
  sl_price DECIMAL(20, 8),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Symbol mappings
CREATE TABLE symbol_mappings (
  id SERIAL PRIMARY KEY,
  base_symbol VARCHAR(50),
  bybit_symbol VARCHAR(50),
  bitget_symbol VARCHAR(50),
  kucoin_symbol VARCHAR(50),
  hyperliquid_symbol VARCHAR(50)
);
```

### 5. Running the Application

```bash
# Development mode (with hot reload)
pnpm dev

# Build and run production
pnpm build
pnpm start

# Watch mode for development
pnpm dev:watch
```

## Configuration

### Trading Parameters

- **MIN_ARB_BPS**: Minimum arbitrage opportunity in basis points (default: 30)
- **MIN_FUNDING_RATE_THRESHOLD**: Minimum funding rate difference threshold (default: 40% over 3 days)
- **ANALYSIS_WINDOW_HOURS**: Historical analysis window (default: 72 hours)
- **MAX_POSITION_SIZE_PER_EXCHANGE**: Maximum position size per exchange in USD

### Risk Management

- **NEAR_LIQUIDATION_PERCENT**: Percentage distance from liquidation to trigger kill switch (default: 15%)
- **MAX_DRAWDOWN_PERCENT**: Maximum portfolio drawdown before stopping (default: 10%)

### Supported Symbols

Currently configured for major cryptocurrencies:
- BTC/USDT
- ETH/USDT  
- SOL/USDT
- AVAX/USDT
- MATIC/USDT
- ADA/USDT
- DOT/USDT
- LINK/USDT
- UNI/USDT
- ATOM/USDT

## How It Works

### 1. Data Collection
- Continuously monitors funding rates across all configured exchanges
- Collects order book depth data for liquidity analysis
- Stores historical data in Supabase for analysis

### 2. Opportunity Analysis
- Analyzes funding rate differences between exchanges
- Checks for persistent funding rate trends (3+ days)
- Validates sufficient liquidity for execution
- Calculates net profit after fees and slippage

### 3. Risk Assessment
- Ensures opportunities meet minimum profit thresholds
- Validates available capital and position limits
- Calculates confidence scores based on data quality

### 4. Execution Strategy (TODO)
- Sets isolated margin mode on both exchanges
- Calculates optimal position sizes
- Executes IOC orders simultaneously
- Implements TP/SL levels with kill switches prioritized

### 5. Position Monitoring (TODO)
- Monitors positions every 5-10 seconds
- Implements kill switches for risk management
- Automatically closes positions on adverse conditions

## Current Implementation Status

### ✅ Completed
- [x] Project structure and configuration
- [x] Database integration (Supabase)
- [x] Exchange interface definition
- [x] Bybit exchange implementation
- [x] Data collection service
- [x] Arbitrage analysis engine
- [x] Main application framework
- [x] Logging and error handling
- [x] Symbol mapping system

### 🚧 In Progress
- [ ] Order execution service
- [ ] Position monitoring service
- [ ] Risk management service
- [ ] Additional exchange implementations (Bitget, KuCoin, Hyperliquid)

### 📋 TODO
- [ ] Complete order execution with IOC orders
- [ ] Implement position monitoring with kill switches
- [ ] Add comprehensive risk management
- [ ] Implement TP/SL order management
- [ ] Add WebSocket feeds for real-time data
- [ ] Performance optimization and monitoring
- [ ] Comprehensive testing suite

## Safety Considerations

### Risk Management
- Start with testnet environments
- Use small position sizes initially
- Monitor positions continuously
- Implement stop-loss mechanisms
- Maintain adequate margin buffers

### Key Safety Features
- **Delta Neutral**: Always maintains equal long/short positions
- **IOC Orders**: Prevents partial fills and execution risk
- **Isolated Margin**: Limits risk exposure per position
- **Kill Switches**: Prioritized over TP/SL for immediate risk control
- **Real-time Monitoring**: Continuous position and risk monitoring

## Monitoring and Logging

The engine provides comprehensive logging:
- All trade executions with timestamps
- Position changes and P&L updates
- Kill switch activations and reasons
- Error conditions with full context
- Performance metrics and statistics

Logs are stored in:
- `logs/combined.log`: All log entries
- `logs/error.log`: Error-only logs
- Console output with color coding

## Development

### Adding New Exchanges

1. Create exchange configuration in `src/config/exchanges/`
2. Implement the exchange class extending `BaseExchange`
3. Add symbol mappings
4. Register in the main application

### Testing

```bash
# Run tests (when implemented)
pnpm test

# Type checking
pnpm type-check

# Linting
pnpm lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is for educational purposes only. Cryptocurrency trading involves substantial risk of loss. Users are responsible for their own trading decisions and should only trade with capital they can afford to lose. The authors are not responsible for any financial losses incurred through the use of this software.

Always test thoroughly on testnet environments before using with real funds. 