# Funding Rate Arbitrage Engine

A TypeScript-based cryptocurrency funding rate arbitrage engine that trades across multiple exchanges to capitalize on funding rate differentials.

## 🚀 Features

- **Multi-Exchange Support**: Bybit, Bitget, KuCoin, and Hyperliquid
- **Production Ready**: Configured for live trading with production API endpoints
- **Risk Management**: Comprehensive risk controls and kill switches
- **Real-time Monitoring**: Continuous position monitoring and automated risk management
- **Delta-Neutral Strategy**: Maintains equal long/short positions across exchanges

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (for database)
- Exchange API keys for production trading

## 🔧 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd funding-engine
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cd backend
cp env.example .env
```

4. Edit `.env` with your production credentials:
```bash
# Database Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Exchange API Keys - PRODUCTION MODE
BYBIT_API_KEY=your_production_bybit_api_key
BYBIT_API_SECRET=your_production_bybit_api_secret
BYBIT_TESTNET=false

BITGET_API_KEY=your_production_bitget_api_key
BITGET_API_SECRET=your_production_bitget_api_secret
BITGET_PASSPHRASE=your_production_bitget_passphrase
BITGET_SANDBOX=false

KUCOIN_API_KEY=your_production_kucoin_api_key
KUCOIN_API_SECRET=your_production_kucoin_api_secret
KUCOIN_PASSPHRASE=your_production_kucoin_passphrase
KUCOIN_SANDBOX=false

HYPERLIQUID_PRIVATE_KEY=your_production_hyperliquid_private_key
HYPERLIQUID_TESTNET=false
```

5. Set up the database schema:
```bash
# Apply the schema to your Supabase database
# Copy the contents of backend/src/database/schema.sql
# and run it in your Supabase SQL editor
```

## 🏃‍♂️ Running the Engine

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## ⚙️ Configuration

### Arbitrage Parameters
- **Minimum Arbitrage BPS**: 30 basis points minimum spread
- **Funding Rate Threshold**: 40% annualized minimum
- **Analysis Window**: 72 hours historical data analysis
- **Max Position Size**: $1,000 per position
- **Total Capital**: $5,000 allocated across 4 exchanges

### Risk Management
- **Position Size**: 20% of capital per position maximum
- **Kill Switch Thresholds**:
  - 80% proximity to liquidation
  - 10% maximum drawdown
  - Single leg detection (one position closed)
- **Concentration Limits**: 30% maximum per symbol

## 🛡️ Safety Features

### Kill Switch Conditions
The engine automatically closes positions when:
- One leg of the arbitrage is closed (single leg detection)
- Position is within 80% of liquidation price
- Strategy drawdown exceeds 10%
- Position size violates limits

### Production Safeguards
- ✅ **All testnet flags set to `false` by default**
- ✅ **Production API endpoints configured**
- ✅ **Comprehensive environment validation**
- ✅ **Real-time position monitoring**
- ✅ **Automatic risk assessment**

## 📊 Monitoring

The engine provides:
- Real-time logging with Winston
- Position monitoring every 5 seconds
- Risk metrics updates every minute
- Opportunity analysis every 10 minutes
- Data collection every 5 minutes

## 🔄 Strategy Flow

1. **Data Collection**: Collect funding rates from all exchanges
2. **Opportunity Analysis**: Identify persistent arbitrage opportunities
3. **Risk Assessment**: Validate trade against risk parameters
4. **Execution**: Place delta-neutral positions simultaneously
5. **Monitoring**: Continuous position and risk monitoring
6. **Exit**: Automatic closure on profit targets or risk triggers

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/           # Exchange and strategy configurations
│   ├── database/         # Supabase client and schema
│   ├── exchanges/        # Exchange implementations
│   ├── services/         # Core arbitrage services
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Helper utilities
│   └── index.ts         # Main application entry point
├── package.json
└── .env                 # Environment configuration
```

## ⚠️ Important Notes

### Production Trading
- **This engine trades with real money on production exchanges**
- **Ensure your API keys have appropriate permissions**
- **Start with small position sizes to test**
- **Monitor logs and positions actively**

### API Key Permissions Required
- **Bybit**: Trade, Read positions, Read funding rates
- **Bitget**: Trade, Read positions, Read funding rates  
- **KuCoin**: Trade, Read positions, Read funding rates
- **Hyperliquid**: Trade, Read positions

### Current Implementation Status
- ✅ **Bybit**: Fully implemented with CCXT
- 🚧 **Bitget**: Config ready, implementation needed
- 🚧 **KuCoin**: Config ready, implementation needed  
- 🚧 **Hyperliquid**: Config ready, implementation needed

## 🚨 Risk Disclaimer

**Trading cryptocurrency involves substantial risk of loss. This software is provided "as is" without warranty. Use at your own risk. The authors are not responsible for any trading losses.**

## 📞 Support

For issues or questions:
1. Check the logs in `logs/` directory
2. Review configuration in `.env` file
3. Ensure database schema is properly applied
4. Verify API key permissions

## 🔧 Development

### Adding New Exchanges
1. Create exchange config in `config/exchanges/`
2. Implement exchange class extending `BaseExchange`
3. Add to main engine initialization
4. Update symbol mappings

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
``` 