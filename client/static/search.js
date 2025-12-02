// ============================================
// STOCK SEARCH FUNCTIONALITY
// ============================================

let searchTimeout = null;
let searchAbortController = null;

/**
 * Initialize search functionality
 */
function initSearch() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const searchContainer = document.getElementById('search-container');
  
  if (!searchInput || !searchResults) return;
  
  // Handle input with debouncing
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) clearTimeout(searchTimeout);
    
    // Clear results if query is empty
    if (query.length === 0) {
      searchResults.innerHTML = '';
      searchResults.classList.remove('active');
      return;
    }
    
    // Debounce search by 300ms
    searchTimeout = setTimeout(() => {
      performSearch(query);
    }, 300);
  });
  
  // Handle focus - show results if there's content
  searchInput.addEventListener('focus', () => {
    if (searchResults.children.length > 0) {
      searchResults.classList.add('active');
    }
  });
  
  // Handle keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = searchResults.querySelectorAll('.search-result-item');
    const activeItem = searchResults.querySelector('.search-result-item.active');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!activeItem && items.length > 0) {
        items[0].classList.add('active');
      } else if (activeItem) {
        const next = activeItem.nextElementSibling;
        if (next) {
          activeItem.classList.remove('active');
          next.classList.add('active');
          next.scrollIntoView({ block: 'nearest' });
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeItem) {
        const prev = activeItem.previousElementSibling;
        if (prev) {
          activeItem.classList.remove('active');
          prev.classList.add('active');
          prev.scrollIntoView({ block: 'nearest' });
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeItem) {
        activeItem.click();
      } else if (items.length > 0) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      searchResults.classList.remove('active');
      searchInput.blur();
    }
  });
  
  // Close results when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
      searchResults.classList.remove('active');
    }
  });
}

/**
 * Perform search API call
 */
async function performSearch(query) {
  const searchResults = document.getElementById('search-results');
  
  // Cancel previous request
  if (searchAbortController) {
    searchAbortController.abort();
  }
  
  searchAbortController = new AbortController();
  
  try {
    // Show loading state
    searchResults.innerHTML = '<div class="search-loading">Searching...</div>';
    searchResults.classList.add('active');
    
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: searchAbortController.signal
    });
    
    const data = await response.json();
    
    if (!data.success || !data.data || data.data.length === 0) {
      searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
      return;
    }
    
    renderSearchResults(data.data);
    
  } catch (error) {
    if (error.name === 'AbortError') return; // Ignore aborted requests
    
    console.error('Search error:', error);
    searchResults.innerHTML = '<div class="search-error">Search failed. Please try again.</div>';
  }
}

/**
 * Render search results
 */
function renderSearchResults(results) {
  const searchResults = document.getElementById('search-results');
  
  let html = '';
  
  results.forEach((result, index) => {
    const typeClass = getTypeClass(result.type);
    const typeLabel = getTypeLabel(result.type);
    
    html += `
      <div class="search-result-item" data-symbol="${result.symbol}" style="animation-delay: ${index * 0.03}s;">
        <div class="search-result-main">
          <div class="search-result-symbol">${result.symbol}</div>
          <div class="search-result-name">${result.name}</div>
        </div>
        <div class="search-result-meta">
          <span class="search-result-type ${typeClass}">${typeLabel}</span>
          <span class="search-result-exchange">${result.exchange}</span>
        </div>
      </div>
    `;
  });
  
  searchResults.innerHTML = html;
  searchResults.classList.add('active');
  
  // Add click handlers
  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const symbol = item.getAttribute('data-symbol');
      navigateToStock(symbol);
    });
    
    // Add hover effect
    item.addEventListener('mouseenter', () => {
      searchResults.querySelectorAll('.search-result-item').forEach(i => {
        i.classList.remove('active');
      });
      item.classList.add('active');
    });
  });
}

/**
 * Navigate to stock detail page
 */
function navigateToStock(symbol) {
  window.location.href = `/detail.html?symbol=${encodeURIComponent(symbol)}`;
}

/**
 * Get type class for styling
 */
function getTypeClass(type) {
  const typeMap = {
    'EQUITY': 'type-equity',
    'ETF': 'type-etf',
    'INDEX': 'type-index',
    'MUTUALFUND': 'type-fund'
  };
  return typeMap[type] || 'type-other';
}

/**
 * Get friendly type label
 */
function getTypeLabel(type) {
  const labelMap = {
    'EQUITY': 'Stock',
    'ETF': 'ETF',
    'INDEX': 'Index',
    'MUTUALFUND': 'Fund'
  };
  return labelMap[type] || type;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearch);
} else {
  initSearch();
}
