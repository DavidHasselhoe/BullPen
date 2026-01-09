import { NextRequest } from 'next/server';
import { lazyIngestCompany } from '@/lib/search/lazy-ingestion';

/**
 * GET /api/ingest/lazy/progress?ticker=...
 * 
 * Server-Sent Events endpoint for streaming lazy ingestion progress
 * This allows the frontend to display real-time progress updates
 */
export async function GET(request: NextRequest) {
  const searchParams = request.searchParams;
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return new Response('Missing ticker parameter', { status: 400 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message to verify stream is working
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`));

      const sendProgress = (step: string, details?: any) => {
        try {
          const message = JSON.stringify({
            type: 'progress',
            step: simplifyStepName(step),
            details,
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error('Error sending progress:', err);
        }
      };

      const sendComplete = (result: any) => {
        try {
          const message = JSON.stringify({
            type: 'complete',
            result,
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error('Error sending complete:', err);
        } finally {
          controller.close();
        }
      };

      const sendError = (error: string) => {
        try {
          const message = JSON.stringify({
            type: 'error',
            error,
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error('Error sending error:', err);
        } finally {
          controller.close();
        }
      };

      try {
        // Start lazy ingestion with progress callback
        const result = await lazyIngestCompany(ticker.toUpperCase(), sendProgress);

        if (result.success) {
          sendComplete(result);
        } else {
          sendError(result.error || 'Ingestion failed');
        }
      } catch (error) {
        sendError(error instanceof Error ? error.message : 'Unknown error');
      }
    },
    cancel() {
      // Handle stream cancellation
      console.log('SSE stream cancelled');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Simplifies progress step names for user-friendly display
 */
function simplifyStepName(step: string): string {
  const stepLower = step.toLowerCase();
  
  // Map technical steps to user-friendly messages
  if (stepLower.includes('looking up') || stepLower.includes('company information')) {
    return 'Looking up company information';
  }
  if (stepLower.includes('company found')) {
    return 'Company found';
  }
  if (stepLower.includes('creating company') || stepLower.includes('company record')) {
    return 'Setting up company profile';
  }
  if (stepLower.includes('ingesting') && stepLower.includes('10-k')) {
    return 'Fetching annual report';
  }
  if (stepLower.includes('ingesting') && stepLower.includes('10-q')) {
    return 'Fetching quarterly reports';
  }
  if (stepLower.includes('fetching') || stepLower.includes('downloading')) {
    return 'Downloading reports';
  }
  if (stepLower.includes('parsing') || stepLower.includes('extracting')) {
    return 'Processing documents';
  }
  if (stepLower.includes('extract') && stepLower.includes('metric')) {
    return 'Extracting financial metrics';
  }
  if (stepLower.includes('ai analysis') || stepLower.includes('analyzing')) {
    return 'Analyzing with AI';
  }
  if (stepLower.includes('generating signals') || stepLower.includes('signals')) {
    return 'Generating insights';
  }
  if (stepLower.includes('trend') || stepLower.includes('analyzing trends')) {
    return 'Detecting trends';
  }
  if (stepLower.includes('composite score') || stepLower.includes('calculating')) {
    return 'Calculating scores';
  }
  if (stepLower.includes('marking') || stepLower.includes('completed')) {
    return 'Finalizing';
  }
  
  // Default: return simplified version
  return step.split(':')[0].trim();
}
