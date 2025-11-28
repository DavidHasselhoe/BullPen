// Logo management and caching

// Store company profiles (logos, etc.)
const companyProfiles = new Map();

// Store logo DOM elements to avoid recreating them
const logoElements = new Map();

// Create logo element (image or placeholder)
export function createLogoElement(symbol, profile) {
  // Check if already cached
  if (logoElements.has(symbol)) {
    return logoElements.get(symbol).cloneNode(true);
  }
  
  let element;
  
  if (profile && profile.logo) {
    // Create image element
    element = document.createElement('img');
    element.src = profile.logo;
    element.alt = symbol;
    element.style.width = '32px';
    element.style.height = '32px';
    element.style.borderRadius = '6px';
    element.style.objectFit = 'contain';
  } else {
    // Create placeholder with gradient and initials
    element = document.createElement('div');
    element.style.width = '32px';
    element.style.height = '32px';
    element.style.borderRadius = '6px';
    
    // Generate color based on symbol to make each unique
    const hash = symbol ? symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    const hue = hash % 360;
    element.style.background = `linear-gradient(135deg, hsl(${hue}, 60%, 65%), hsl(${hue}, 60%, 50%))`;
    element.style.display = 'flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
    element.style.fontSize = '11px';
    element.style.fontWeight = '600';
    element.style.color = '#fff';
    element.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
    element.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
    element.textContent = symbol ? symbol.substring(0, 2).toUpperCase() : '?';
    element.title = symbol;
  }
  
  // Cache the element
  logoElements.set(symbol, element);
  
  return element.cloneNode(true);
}

// Get or create logo element
export function getLogoElement(symbol) {
  const profile = companyProfiles.get(symbol);
  return createLogoElement(symbol, profile);
}

// Store company profile
export function setCompanyProfile(symbol, profile) {
  companyProfiles.set(symbol, profile);
  
  // Clear cached logo if we have a new profile with a logo
  if (profile && profile.logo) {
    logoElements.delete(symbol);
  }
}

// Get company profile
export function getCompanyProfile(symbol) {
  return companyProfiles.get(symbol);
}

// Check if we have a profile for this symbol
export function hasCompanyProfile(symbol) {
  return companyProfiles.has(symbol);
}

// Update logo element in cache (useful when profile is loaded after initial render)
export function updateLogoCache(symbol, profile) {
  if (!profile || !profile.logo) return;
  
  const cached = logoElements.get(symbol);
  // Only update if we don't have a logo yet (placeholder only)
  if (!cached || cached.tagName === 'DIV') {
    // Create new image element
    const img = document.createElement('img');
    img.src = profile.logo;
    img.alt = symbol;
    img.style.width = '32px';
    img.style.height = '32px';
    img.style.borderRadius = '6px';
    img.style.objectFit = 'contain';
    logoElements.set(symbol, img);
  }
}

// Get all cached logos (for debugging)
export function getAllCachedLogos() {
  return new Map(logoElements);
}

// Clear logo caches
export function clearLogoCaches() {
  companyProfiles.clear();
  logoElements.clear();
}

export { companyProfiles, logoElements };
