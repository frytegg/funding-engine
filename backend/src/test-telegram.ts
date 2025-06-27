// Test script for Telegram Bot functionality
import dotenv from 'dotenv';
dotenv.config();

import { TelegramBotService } from './services/TelegramBot';
import { ArbitrageOpportunity, TradeResult } from './types/common';

async function testTelegramBot() {
  console.log('🧪 Testing Telegram Bot functionality...');
  
  const telegramBot = new TelegramBotService();
  
  if (!telegramBot.isActive()) {
    console.log('❌ Telegram bot is not configured. Please check your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.');
    return;
  }

  console.log('✅ Telegram bot is active, running tests...');

  try {
    // Test 1: Connection test
    console.log('\n1. Testing connection...');
    const connectionTest = await telegramBot.testConnection();
    console.log(connectionTest ? '✅ Connection test passed' : '❌ Connection test failed');

    // Test 2: Opportunity Alert
    console.log('\n2. Testing opportunity alert...');
    const sampleOpportunity: ArbitrageOpportunity = {
      symbol: 'BTC/USDT',
      longExchange: 'bybit',
      shortExchange: 'bitget',
      longFundingRate: 0.0001,
      shortFundingRate: 0.0015,
      fundingRateDiff: 0.0014,
      arbBasisPoints: 14,
      estimatedProfit: 85.50,
      optimalSize: 1000,
      confidence: 0.85,
      riskScore: 0.3
    };

    await telegramBot.sendOpportunityAlert(sampleOpportunity);
    console.log('✅ Opportunity alert sent');

    // Test 3: Trade Alert - Success
    console.log('\n3. Testing successful trade alert...');
    const sampleTradeResult: TradeResult = {
      orderId: 'test-order-123',
      exchange: 'bybit',
      symbol: 'BTC/USDT',
      side: 'buy',
      price: 42500.00,
      quantity: 0.0235,
      fees: 2.45,
      status: 'filled',
      timestamp: new Date()
    };

    await telegramBot.sendTradeAlert(sampleTradeResult, 'strategy-abc123', 'EXECUTED');
    console.log('✅ Successful trade alert sent');

    // Test 4: Trade Alert - Failed
    console.log('\n4. Testing failed trade alert...');
    const failedTradeResult: TradeResult = {
      orderId: 'test-order-456',
      exchange: 'bitget',
      symbol: 'BTC/USDT',
      side: 'sell',
      price: 42450.00,
      quantity: 0.0235,
      fees: 0,
      status: 'failed',
      timestamp: new Date()
    };

    await telegramBot.sendTradeAlert(failedTradeResult, 'strategy-abc123', 'FAILED');
    console.log('✅ Failed trade alert sent');

    // Test 5: Risk Alert
    console.log('\n5. Testing risk alert...');
    await telegramBot.sendRiskAlert('HIGH_EXPOSURE', {
      totalExposure: 4500,
      maxAllowed: 4000
    });
    console.log('✅ Risk alert sent');

    // Test 6: Daily Summary
    console.log('\n6. Testing daily summary...');
    await telegramBot.sendDailySummary({
      totalPnL: 156.78,
      tradesExecuted: 8,
      opportunitiesFound: 12,
      avgSpread: 45,
      winRate: 0.75
    });
    console.log('✅ Daily summary sent');

    console.log('\n🎉 All Telegram bot tests completed successfully!');
    console.log('\nCheck your Telegram chat to see all the test messages.');

  } catch (error) {
    console.error('❌ Error during Telegram bot testing:', error);
  }
}

// Run the test
testTelegramBot().catch(console.error); 