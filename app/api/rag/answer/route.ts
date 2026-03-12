import { NextRequest, NextResponse } from 'next/server';
import { answerFinancialQuestion, RAGError } from '@/lib/rag/rag-assistant';
import { createServerClient } from '@/lib/supabase/client';
import { addSecurityHeaders, withRateLimit } from '@/lib/security/api-security';

/**
 * POST /api/rag/answer
 *
 * RAG assistant endpoint for answering financial questions.
 * Rate limited to prevent abuse (20 requests per minute).
 *
 * Request body:
 * - question: string (required) - The financial question to answer
 * - companyId: string (required) - UUID of the company
 *
 * Response:
 * {
 *   success: boolean
 *   data?: {
 *     summary: string
 *     keyDrivers: string[]
 *     citedSources: Array<{ filingType, section, fiscalPeriod }>
 *   }
 *   error?: string
 * }
 */
async function handler(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    
    if (!body || typeof body !== 'object') {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Invalid request body' },
          { status: 400 }
        )
      );
    }
    
    const { question, companyId } = body;
    
    // Validate inputs
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Question is required and must be a non-empty string' },
          { status: 400 }
        )
      );
    }
    
    if (!companyId || typeof companyId !== 'string') {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Company ID is required' },
          { status: 400 }
        )
      );
    }
    
    // Verify company exists
    const supabase = createServerClient();
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('id', companyId)
      .single();
    
    if (companyError || !company) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Company not found' },
          { status: 404 }
        )
      );
    }
    
    // Call RAG assistant
    const response = await answerFinancialQuestion(question.trim(), companyId);
    
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        data: response,
      })
    );
  } catch (error) {
    // Handle RAG-specific errors
    if (error instanceof RAGError) {
      const statusCode = 
        error.code === 'NO_DATA' ? 404 :
        error.code === 'AMBIGUOUS_PERIOD' ? 400 :
        error.code === 'LLM_ERROR' ? 502 :
        error.code === 'MALFORMED_OUTPUT' ? 502 :
        500;
      
      return addSecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: error.message,
            code: error.code,
          },
          { status: statusCode }
        )
      );
    }
    
    // Handle unexpected errors
    console.error('[RAG API] Unexpected error:', error);
    return addSecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: 'Internal server error',
        },
        { status: 500 }
      )
    );
  }
}

// Only allow POST requests
export async function GET() {
  return addSecurityHeaders(
    NextResponse.json(
      {
        success: false,
        error: 'Method not allowed. This endpoint requires POST.',
        usage: {
          method: 'POST',
          url: '/api/rag/answer',
          body: {
            question: 'string (required) - The financial question to answer',
            companyId: 'string (required) - UUID of the company'
          }
        }
      },
      { status: 405 }
    )
  );
}
