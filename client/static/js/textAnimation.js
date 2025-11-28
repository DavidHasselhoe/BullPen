// Text blur animation for vanilla JS
export function animateBlurText(element, options = {}) {
  const {
    delay = 50,
    duration = 600,
    stagger = true
  } = options;
  
  if (!element || !element.textContent) return;
  
  const text = element.textContent;
  element.textContent = '';
  element.style.display = 'inline-block';
  
  // Split text into individual characters
  const chars = text.split('');
  
  chars.forEach((char, index) => {
    const span = document.createElement('span');
    span.textContent = char === ' ' ? '\u00A0' : char; // Preserve spaces
    span.style.display = 'inline-block';
    span.style.opacity = '0';
    span.style.filter = 'blur(10px)';
    span.style.transform = 'translateY(20px)';
    span.style.transition = `all ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    
    element.appendChild(span);
    
    // Animate each character
    const animationDelay = stagger ? index * delay : 0;
    
    setTimeout(() => {
      span.style.opacity = '1';
      span.style.filter = 'blur(0px)';
      span.style.transform = 'translateY(0)';
    }, animationDelay);
  });
}

// Animate all elements with a specific selector
export function animateAllBlurText(selector, options = {}) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(element => {
    // Use IntersectionObserver to trigger animation when element is in view
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !element.dataset.animated) {
          element.dataset.animated = 'true';
          animateBlurText(element, options);
          observer.unobserve(element);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '-50px'
    });
    
    observer.observe(element);
  });
}
