# Telegram Bot Setup Guide

This guide will help you set up Telegram bot alerts for your Web3 Arbitrage Bot.

## Prerequisites

1. **Telegram Account**: You need a Telegram account
2. **BotFather Access**: Access to create bots via BotFather

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a conversation with BotFather by sending `/start`
3. Create a new bot by sending `/newbot`
4. Choose a name for your bot (e.g., "My Arbitrage Bot")
5. Choose a username for your bot (must end with 'bot', e.g., "my_arbitrage_bot")
6. **Save the bot token** - you'll need this for the environment variables

## Step 2: Get Your Chat ID

1. Start a conversation with your newly created bot
2. Send any message to your bot
3. Open this URL in your browser, replacing `YOUR_BOT_TOKEN` with your actual bot token:
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. Look for the `"chat":{"id":` field in the response
5. **Save this chat ID** - you'll need this for the environment variables

## Step 3: Configure Environment Variables

Add these variables to your `.env` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

## Step 4: Test the Integration

Run the test script to verify everything is working:

```bash
npm run test-telegram
```

This will send test messages to your Telegram chat to confirm the integration is working properly.

## Alert Types

The bot will send the following types of alerts:

### 1. 🔍 New Arbitrage Opportunities
- **Trigger**: When profitable arbitrage opportunities are detected
- **Frequency**: Only high-quality opportunities (confidence > 60%, risk < 70%, profit > $20)
- **Limit**: Maximum 3 alerts per analysis cycle to avoid spam

**Example Alert:**
```
🔥 NEW ARBITRAGE OPPORTUNITY

📊 Symbol: BTC/USDT
📈 Long: bybit (0.0100%)
📉 Short: bitget (0.1500%)

💎 Spread: 140 bps
💰 Est. Profit: $85.50
📏 Optimal Size: $1000
🎯 Confidence: 85.0%
🟢 Risk Score: 3/10

⏰ Time: 2024-01-15 14:30:25
```

### 2. 💰 Trade Execution Alerts
- **Trigger**: When trades are executed (both successful and failed)
- **Frequency**: Real-time for each trade leg (long/short)

**Example Alert:**
```
✅ TRADE EXECUTED

🆔 Strategy ID: abc12345...
🏢 Exchange: bybit
📊 Symbol: BTC/USDT
📈 Side: BUY
💰 Price: $42,500.00
📏 Quantity: 0.0235
💸 Fees: $2.45
🟢 Status: FILLED

⏰ Time: 2024-01-15 14:31:02
```

### 3. ⚠️ Risk Alerts
- **Trigger**: When risk thresholds are exceeded
- **Types**: High exposure, drawdown, liquidation risk

**Example Alert:**
```
🚨 HIGH EXPOSURE ALERT

Total exposure: $4,500.00
Max allowed: $4,000.00

⚠️ Immediate action may be required!
⏰ Time: 2024-01-15 14:35:15
```

### 4. 📊 Daily Summary
- **Trigger**: Daily at midnight UTC
- **Content**: P&L, trades executed, opportunities found, win rate

**Example Alert:**
```
📊 DAILY SUMMARY

📈 Total P&L: $156.78
🔄 Trades Executed: 8
🎯 Opportunities Found: 12
📏 Avg Spread: 45 bps
🔥 Win Rate: 75.0%

⏰ Date: Mon Jan 15 2024
🤖 Status: Active and monitoring
```

## Bot Commands

Users can interact with the bot using these commands:

- `/start` - Initialize the bot
- `/help` - Show available commands
- `/status` - Get current bot status
- `/opportunities` - Get active arbitrage opportunities
- `/positions` - Get current positions
- `/pnl` - Get P&L summary

## Configuration Options

You can customize the alert behavior by modifying these settings in the `TelegramBotService`:

### Opportunity Alert Filters
```typescript
// Only send alerts for opportunities that meet these criteria:
const highQualityOpportunities = opportunities.filter(opp => 
  opp.confidence > 0.6 &&      // Confidence > 60%
  opp.riskScore < 0.7 &&       // Risk score < 70%
  opp.estimatedProfit > 20     // Minimum $20 profit
);
```

### Rate Limiting
```typescript
// Maximum 3 opportunity alerts per cycle
const topOpportunities = highQualityOpportunities.slice(0, 3);

// 1 second delay between alerts
await sleep(1000);
```

## Troubleshooting

### Bot Not Responding
1. Check that `TELEGRAM_BOT_TOKEN` is correct
2. Verify the bot is not blocked or deleted
3. Ensure the bot has been started with `/start` command

### Not Receiving Alerts
1. Verify `TELEGRAM_CHAT_ID` is correct
2. Check that you've sent at least one message to the bot
3. Run the test script to verify configuration

### Rate Limiting Issues
1. Telegram has rate limits (30 messages per second)
2. The bot includes delays to prevent hitting limits
3. If you see rate limit errors, increase the delay in `sleep()` calls

### Error Messages
Common error messages and solutions:

- **"Telegram bot not configured"**: Missing token or chat ID
- **"Failed to send message"**: Network issues or invalid token
- **"Chat not found"**: Incorrect chat ID or bot hasn't been started

## Security Considerations

1. **Keep your bot token secret** - Never commit it to version control
2. **Use environment variables** - Store sensitive data in `.env` file
3. **Limit bot permissions** - Only give necessary permissions
4. **Monitor bot usage** - Check for unexpected activity

## Advanced Features

### Custom Message Formatting
You can customize message formatting by modifying the format methods in `TelegramBotService`:

```typescript
private formatOpportunityMessage(opportunity: ArbitrageOpportunity): string {
  // Customize the message format here
  return `Your custom message format`;
}
```

### Adding New Alert Types
To add new alert types:

1. Create a new public method in `TelegramBotService`
2. Add the method call in the appropriate service
3. Create a private format method for the message

### Webhook Integration
For production deployments, consider using webhooks instead of polling:

```typescript
// In TelegramBotService constructor
this.bot = new TelegramBot(token, { 
  webHook: {
    port: process.env.TELEGRAM_WEBHOOK_PORT || 8443,
    host: process.env.TELEGRAM_WEBHOOK_HOST || 'localhost'
  }
});
```

## Support

If you encounter issues:

1. Check the logs for error messages
2. Run the test script to verify configuration
3. Verify all environment variables are set correctly
4. Check Telegram API documentation for rate limits and restrictions

## License

This Telegram bot integration is part of the Web3 Arbitrage Bot project and follows the same license terms. 