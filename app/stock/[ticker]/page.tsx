// Placeholder Stock Detail Page
// This will be implemented in a future iteration

export default function StockDetailPage({ params }: { params: { ticker: string } }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {params.ticker.toUpperCase()}
          </h1>
          <p className="mt-2 text-muted-foreground">Stock detail page coming soon.</p>
        </div>
      </main>
    </div>
  );
}
