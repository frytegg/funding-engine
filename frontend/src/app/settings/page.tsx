'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-4xl font-bold text-white mb-8">Settings</h1>
      
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Exchange Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">API Key</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white"
                    placeholder="Enter API Key"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">API Secret</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white"
                    placeholder="Enter API Secret"
                  />
                </div>
              </div>
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                Save Configuration
              </button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Trading Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Minimum Spread (bps)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white"
                    placeholder="Enter minimum spread"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Maximum Position Size</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white"
                    placeholder="Enter maximum position size"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Stop Loss (%)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white"
                    placeholder="Enter stop loss percentage"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Take Profit (%)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white"
                    placeholder="Enter take profit percentage"
                  />
                </div>
              </div>
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                Save Parameters
              </button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="email-notifications"
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800/50 text-green-500"
                />
                <label htmlFor="email-notifications" className="text-white">
                  Email Notifications
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="telegram-notifications"
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800/50 text-green-500"
                />
                <label htmlFor="telegram-notifications" className="text-white">
                  Telegram Notifications
                </label>
              </div>
              <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                Save Notification Settings
              </button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
} 