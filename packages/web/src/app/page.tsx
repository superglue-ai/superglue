'use client'

import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import { ArrowRight, Bot, Code, Database, Zap } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-primary/10 rounded-full">
              <Bot className="w-12 h-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            AI Assistant with Superglue MCP
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Your intelligent assistant for API integrations, data transformations, and workflow automation.
            Powered by Superglue Model Context Protocol.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/agent">
              <Button size="lg" className="gap-2">
                <Bot className="w-5 h-5" />
                Start Chatting
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/configs">
              <Button variant="outline" size="lg">
                View Integrations
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="p-2 bg-blue-500/10 rounded-lg w-fit mb-2">
                <Zap className="w-6 h-6 text-blue-500" />
              </div>
              <CardTitle>Smart Integration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Build API integrations through natural language. Just describe what you want to connect and our AI will handle the rest.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="p-2 bg-green-500/10 rounded-lg w-fit mb-2">
                <Code className="w-6 h-6 text-green-500" />
              </div>
              <CardTitle>Code Generation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Generate production-ready integration code in TypeScript, Python, or Go. Ready to use in your applications.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-2">
                <Database className="w-6 h-6 text-purple-500" />
              </div>
              <CardTitle>Data Transformation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Transform and map data between different systems seamlessly. Handle complex data pipelines with ease.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Example Queries */}
        <div className="bg-muted/30 rounded-lg p-8 mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-center">Try These Examples</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-medium text-lg">API Integrations</h3>
              <div className="space-y-2">
                <div className="p-3 bg-background rounded border text-sm">
                  "Connect to Stripe API to get customer data"
                </div>
                <div className="p-3 bg-background rounded border text-sm">
                  "Build integration to sync HubSpot deals to Slack"
                </div>
                <div className="p-3 bg-background rounded border text-sm">
                  "Get HubSpot closed deals for 2025"
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-lg">Data Operations</h3>
              <div className="space-y-2">
                <div className="p-3 bg-background rounded border text-sm">
                  "Transform JSON from API A to format for API B"
                </div>
                <div className="p-3 bg-background rounded border text-sm">
                  "Query PostgreSQL database for user analytics"
                </div>
                <div className="p-3 bg-background rounded border text-sm">
                  "Generate TypeScript code for my integration"
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Experience the power of AI-driven integrations. Start building your automations today.
          </p>
          <Link href="/agent">
            <Button size="lg" className="gap-2">
              <Bot className="w-5 h-5" />
              Launch AI Assistant
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}