'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, MessageSquare, Building2 } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  data?: {
    summary: string;
    keyDrivers: string[];
    citedSources: Array<{
      filingType: string;
      section: string;
      fiscalPeriod: string;
    }>;
  };
}

interface RAGResponse {
  success: boolean;
  data?: {
    summary: string;
    keyDrivers: string[];
    citedSources: Array<{
      filingType: string;
      section: string;
      fiscalPeriod: string;
    }>;
  };
  error?: string;
  code?: string;
}

export default function RAGChatPage() {
  const { background } = useBackground();
  const [ticker, setTicker] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadCompany = async (tickerValue: string) => {
    if (!tickerValue.trim()) {
      setCompanyId(null);
      setCompanyName(null);
      return;
    }

    setIsLoadingCompany(true);
    try {
      const response = await fetch(`/api/metrics/company?ticker=${encodeURIComponent(tickerValue.toUpperCase())}`);
      const data = await response.json();

      if (data.success && data.companyId) {
        setCompanyId(data.companyId);
        setCompanyName(data.companyName || tickerValue.toUpperCase());
      } else {
        setCompanyId(null);
        setCompanyName(null);
      }
    } catch (error) {
      console.error('Error loading company:', error);
      setCompanyId(null);
      setCompanyName(null);
    } finally {
      setIsLoadingCompany(false);
    }
  };

  const handleTickerChange = (value: string) => {
    setTicker(value);
    if (value.trim()) {
      loadCompany(value);
    } else {
      setCompanyId(null);
      setCompanyName(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim() || !companyId) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/rag/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userMessage.content,
          companyId,
        }),
      });

      const data: RAGResponse = await response.json();

      if (data.success && data.data) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.data.summary,
          timestamp: new Date(),
          data: data.data,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.error || 'Sorry, I encountered an error processing your question.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error calling RAG API:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${background}`}>
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Card className="h-[calc(100vh-4rem)] flex flex-col">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-6 w-6" />
                <CardTitle>Financial AI Assistant</CardTitle>
              </div>
              <Badge variant="outline" className="flex items-center gap-2">
                <Building2 className="h-3 w-3" />
                {companyName || 'No company selected'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
            {/* Company Selector */}
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter company ticker (e.g., AAPL, TSLA, NVDA)"
                  value={ticker}
                  onChange={(e) => handleTickerChange(e.target.value)}
                  className="flex-1"
                  disabled={isLoadingCompany}
                />
                {isLoadingCompany && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {!companyId && ticker && !isLoadingCompany && (
                <p className="text-sm text-muted-foreground mt-2">
                  Company not found. Please check the ticker and try again.
                </p>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center">
                  <div className="space-y-2">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {companyId
                        ? `Ask a question about ${companyName}`
                        : 'Select a company to get started'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        {message.data && message.data.keyDrivers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <p className="text-xs font-semibold mb-2 opacity-80">Key Drivers:</p>
                            <ul className="text-xs space-y-1 list-disc list-inside opacity-80">
                              {message.data.keyDrivers.map((driver, idx) => (
                                <li key={idx}>{driver}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {message.data && message.data.citedSources.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <p className="text-xs font-semibold mb-2 opacity-80">Sources:</p>
                            <div className="flex flex-wrap gap-1">
                              {message.data.citedSources.map((source, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {source.filingType} • {source.section}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t bg-muted/30">
              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <Input
                  placeholder={
                    companyId
                      ? `Ask a question about ${companyName}...`
                      : 'Select a company first...'
                  }
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={!companyId || isLoading}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={!companyId || !question.trim() || isLoading}
                  size="icon"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
