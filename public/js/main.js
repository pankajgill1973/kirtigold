/* ==========================================================================
   KIRTI GOLD INDUSTRIES - CLIENT INTERACTIVITY ENGINE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initStickyHeader();
  initToastNotificationContainer();
  initFormSubmissions();
  initScrollReveal();
});

// Scroll Reveal Observer
function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  revealElements.forEach(el => observer.observe(el));
}


// 1. Navigation & Mobile Menu Toggle
function initNavigation() {
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    // Close menu when clicking link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
  }
}

// 2. Sticky Header transition
function initStickyHeader() {
  const header = document.querySelector('header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('sticky');
      } else {
        header.classList.remove('sticky');
      }
    });
  }
}

// 3. Toast Notifications System
function initToastNotificationContainer() {
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

function showToast(message, type = 'success') {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '⚡';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✗';
  if (type === 'info') icon = 'ℹ';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  toastContainer.appendChild(toast);
  
  // Trigger transition
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4000);
}
window.showToast = showToast;

// 4. API Form Submissions
function initFormSubmissions() {
  // Newsletter Form
  const newsletterForms = document.querySelectorAll('.newsletter-form');
  newsletterForms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('.newsletter-input');
      const email = input.value.trim();

      if (!email) {
        showToast('Please enter your email.', 'error');
        return;
      }

      try {
        const response = await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const result = await response.json();
        
        if (result.success) {
          showToast(result.message, 'success');
          input.value = '';
        } else {
          showToast(result.message, 'error');
        }
      } catch (err) {
        showToast('Failed to connect to server.', 'error');
      }
    });
  });

  // Contact / General Enquiry Form
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('enqName').value.trim();
      const email = document.getElementById('enqEmail').value.trim();
      const phone = document.getElementById('enqPhone').value.trim();
      const product = document.getElementById('enqProduct').value;
      const message = document.getElementById('enqMessage').value.trim();

      if (!name || !email || !message) {
        showToast('Please fill in Name, Email and Message.', 'error');
        return;
      }

      try {
        const response = await fetch('/api/enquire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, product, message })
        });
        const result = await response.json();

        if (result.success) {
          showToast(result.message, 'success');
          contactForm.reset();
        } else {
          showToast(result.message, 'error');
        }
      } catch (err) {
        showToast('Server connection failed.', 'error');
      }
    });
  }

  // Distributor Application Form
  const distributorForm = document.getElementById('distributorForm');
  if (distributorForm) {
    distributorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const companyName = document.getElementById('distCompany').value.trim();
      const contactPerson = document.getElementById('distPerson').value.trim();
      const email = document.getElementById('distEmail').value.trim();
      const phone = document.getElementById('distPhone').value.trim();
      const state = document.getElementById('distState').value;
      const city = document.getElementById('distCity').value.trim();
      const experience = document.getElementById('distExp').value.trim();
      const investment = document.getElementById('distInvestment').value;
      const message = document.getElementById('distMsg').value.trim();

      if (!companyName || !contactPerson || !email || !phone || !state || !city) {
        showToast('Please fill in all mandatory fields.', 'error');
        return;
      }

      try {
        const response = await fetch('/api/distributor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName, contactPerson, email, phone, state, city, experience, investment, message
          })
        });
        const result = await response.json();

        if (result.success) {
          showToast(result.message, 'success');
          distributorForm.reset();
        } else {
          showToast(result.message, 'error');
        }
      } catch (err) {
        showToast('Connection failed. Please retry.', 'error');
      }
    });
  }
}

// 5. Dynamic Product Details Modal Launcher
window.openProductDetail = function(productName, productDesc, category, imagePath, nutrition, packaging, recipeTip) {
  const modal = document.getElementById('productModal');
  if (!modal) return;

  const titleEl = document.getElementById('modalTitle');
  const catEl = document.getElementById('modalCat');
  const descEl = document.getElementById('modalDesc');
  const imgEl = document.getElementById('modalImg');
  const nutritionEl = document.getElementById('modalNutrition');
  const packagingEl = document.getElementById('modalPackaging');
  
  // Prefill product enquiry select list
  const inquirySelect = document.getElementById('enqProduct');
  if (inquirySelect) {
    // Select option matching productName or append it
    let found = false;
    for (let opt of inquirySelect.options) {
      if (opt.value.toLowerCase().includes(productName.toLowerCase()) || productName.toLowerCase().includes(opt.value.toLowerCase())) {
        inquirySelect.value = opt.value;
        found = true;
        break;
      }
    }
    if (!found) {
      const newOpt = new Option(productName, productName);
      inquirySelect.add(newOpt);
      inquirySelect.value = productName;
    }
  }

  // Populate data
  if (titleEl) titleEl.innerText = productName;
  if (catEl) catEl.innerText = category;
  if (descEl) descEl.innerText = productDesc;
  if (imgEl) imgEl.src = imagePath;
  
  // Format Nutrition list
  if (nutritionEl) {
    nutritionEl.innerHTML = '';
    if (nutrition && Array.isArray(nutrition)) {
      nutrition.forEach(nutri => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${nutri.key}:</strong> ${nutri.value}`;
        nutritionEl.appendChild(li);
      });
    } else {
      nutritionEl.innerHTML = '<li>Rich in nutrients and standard elements</li>';
    }
  }

  // Format Packaging list
  if (packagingEl) {
    packagingEl.innerHTML = '';
    if (packaging && Array.isArray(packaging)) {
      packaging.forEach(pack => {
        const span = document.createElement('span');
        span.className = 'badge-status completed';
        span.style.marginRight = '0.5rem';
        span.style.marginBottom = '0.5rem';
        span.style.display = 'inline-block';
        span.innerText = pack;
        packagingEl.appendChild(span);
      });
    } else {
      packagingEl.innerHTML = '<span>Available in Standard consumer packaging.</span>';
    }
  }

  // Dynamic Recipe Insertion
  let recipeEl = document.getElementById('modalRecipe');
  if (!recipeEl) {
    recipeEl = document.createElement('div');
    recipeEl.id = 'modalRecipe';
    if (packagingEl && packagingEl.parentNode) {
      packagingEl.parentNode.insertBefore(recipeEl, packagingEl.nextSibling);
    }
  }
  
  if (recipeEl) {
    if (recipeTip) {
      recipeEl.innerHTML = `
        <h4 style="font-size: 1.05rem; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.3rem; margin-top: 1rem; color: var(--primary);">🧑‍🍳 Chef's Culinary Tip / Health Note:</h4>
        <p style="font-size: 0.9rem; font-style: italic; color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.5;">"${recipeTip}"</p>
      `;
    } else {
      recipeEl.innerHTML = '';
    }
  }

  modal.classList.add('active');
};

window.closeProductModal = function() {
  const modal = document.getElementById('productModal');
  if (modal) {
    modal.classList.remove('active');
  }
};
