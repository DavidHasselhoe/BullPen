import { NextRequest } from 'next/server';
import { lazyIngestCompany } from '@/lib/search/lazy-ingestion';

/**
 * GET /api/ingest/lazy/progress?ticker=...
 * 
 * Server-Sent Events endpoint for streaming lazy ingestion progress
 * This allows the frontend to display real-time progress updates
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return new Response('Missing ticker parameter', { status: 400 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  let streamClosed = false;
  
  const stream = new ReadableStream({
    async start(controller) {
      // Track seen objects for circular reference detection
      const seen = new WeakSet();
      
      // Send initial connection message to verify stream is working
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`));
      } catch (err) {
        console.error('Error sending initial connection message:', err);
      }

      const sendProgress = (step: string, details?: any) => {
        if (streamClosed) {
          return; // Don't try to send if stream is closed
        }
        
        try {
          // Sanitize details to avoid circular references or non-serializable data
          let sanitizedDetails: any = undefined;
          if (details) {
            try {
              // Create a new WeakSet for this serialization to avoid cross-call issues
              const localSeen = new WeakSet();
              // Try to serialize and parse to ensure it's valid JSON
              sanitizedDetails = JSON.parse(JSON.stringify(details, (key, value) => {
                // Remove functions, undefined, and symbols
                if (typeof value === 'function' || value === undefined || typeof value === 'symbol') {
                  return null;
                }
                // Handle circular references
                if (typeof value === 'object' && value !== null) {
                  if (localSeen.has(value)) {
                    return '[Circular]';
                  }
                  localSeen.add(value);
                }
                return value;
              }));
            } catch {
              // If details can't be serialized, just use a simple message
              sanitizedDetails = { message: 'Processing...' };
            }
          }
          
          const message = JSON.stringify({
            type: 'progress',
            step: simplifyStepName(step),
            details: sanitizedDetails,
            timestamp: new Date().toISOString(),
          });
          
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          // Silently fail - don't spam console with errors during normal operation
          // Only log if it's a critical error
          if (err instanceof Error && !err.message.includes('stream')) {
            console.error('Error sending progress:', err.message);
          }
        }
      };

      const sendComplete = (result: any) => {
        if (streamClosed) {
          return;
        }
        
        try {
          // Sanitize result to avoid serialization issues
          let sanitizedResult: any = null;
          if (result) {
            try {
              sanitizedResult = JSON.parse(JSON.stringify(result, (key, value) => {
                if (typeof value === 'function' || value === undefined || typeof value === 'symbol') {
                  return null;
                }
                return value;
              }));
            } catch {
              sanitizedResult = { success: result.success || false };
            }
          }
          
          const message = JSON.stringify({
            type: 'complete',
            result: sanitizedResult,
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error('Error sending complete:', err);
        } finally {
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // Stream might already be closed
          }
        }
      };

      const sendError = (error: string) => {
        if (streamClosed) {
          return;
        }
        
        try {
          const message = JSON.stringify({
            type: 'error',
            error: error || 'Unknown error',
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          console.error('Error sending error:', err);
        } finally {
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // Stream might already be closed
          }
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
      streamClosed = true;
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
