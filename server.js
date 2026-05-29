const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Security and utility middleware
app.use(cors());

// Configure CSP in Helmet to allow loading from Google Fonts, YouTube embeds, and local styles/scripts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:*"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"]
    }
  },
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  }
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Path to JSON data files
const DATA_DIR = path.join(__dirname, 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const ENQUIRIES_FILE = path.join(DATA_DIR, 'enquiries.json');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');

// Ensure data directory and files exist
async function initDatabase() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    const checkFile = async (filePath) => {
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
      }
    };

    await checkFile(SUBSCRIBERS_FILE);
    await checkFile(ENQUIRIES_FILE);
    await checkFile(APPLICATIONS_FILE);
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Utility to read JSON database
async function readData(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Utility to write JSON database
async function writeData(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    return false;
  }
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Public APIs

// 1. Newsletter subscription
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  try {
    const subscribers = await readData(SUBSCRIBERS_FILE);
    
    // Check if email already exists
    if (subscribers.some(s => s.email.toLowerCase() === email.toLowerCase())) {
      return res.status(200).json({ success: true, message: 'Already subscribed! Thank you.' });
    }

    subscribers.push({
      email: email.toLowerCase(),
      subscribedAt: new Date().toISOString()
    });

    await writeData(SUBSCRIBERS_FILE, subscribers);
    res.status(200).json({ success: true, message: 'Subscription successful! Thank you.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// 2. Product enquiries and general messages
app.post('/api/enquire', async (req, res) => {
  const { name, email, phone, product, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Please fill in all required fields (Name, Email, Message).' });
  }

  try {
    const enquiries = await readData(ENQUIRIES_FILE);
    
    const newEnquiry = {
      id: 'ENQ-' + Date.now(),
      name,
      email,
      phone: phone || 'N/A',
      product: product || 'General Inquiry',
      message,
      createdAt: new Date().toISOString(),
      status: 'Pending'
    };

    enquiries.push(newEnquiry);
    await writeData(ENQUIRIES_FILE, enquiries);

    console.log(`[EMAIL SIMULATOR] Sending inquiry confirmation to ${email} and alert to admin (cpd@kirtigroup.com)`);

    res.status(200).json({ success: true, message: 'Your inquiry has been submitted! Our team will contact you shortly.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// 3. Distributor / Partner Onboarding application
app.post('/api/distributor', async (req, res) => {
  const { companyName, contactPerson, email, phone, state, city, experience, investment, message } = req.body;

  if (!companyName || !contactPerson || !email || !phone || !state || !city) {
    return res.status(400).json({ success: false, message: 'Please fill in all mandatory fields.' });
  }

  try {
    const applications = await readData(APPLICATIONS_FILE);

    const newApplication = {
      id: 'APP-' + Date.now(),
      companyName,
      contactPerson,
      email,
      phone,
      state,
      city,
      experience: experience || 'None',
      investment: investment || 'N/A',
      message: message || 'N/A',
      createdAt: new Date().toISOString(),
      status: 'Pending'
    };

    applications.push(newApplication);
    await writeData(APPLICATIONS_FILE, applications);

    console.log(`[EMAIL SIMULATOR] Sending partnership confirmation to ${email}`);

    res.status(200).json({ success: true, message: 'Thank you for your interest! Your distributor application was successfully submitted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// Admin APIs (Protected by custom authentication)

const ADMIN_PASSWORD = 'kirtigold2026'; // Default password

// Simple custom auth middleware
const adminAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized access. Invalid credentials.' });
  }
  next();
};

// 4. Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.status(200).json({ success: true, token: ADMIN_PASSWORD, message: 'Login successful.' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password.' });
  }
});

// 5. Admin data endpoint (Fetches all subscriptions, leads, enquiries)
app.get('/api/admin/data', adminAuth, async (req, res) => {
  try {
    const subscribers = await readData(SUBSCRIBERS_FILE);
    const enquiries = await readData(ENQUIRIES_FILE);
    const applications = await readData(APPLICATIONS_FILE);

    res.status(200).json({
      success: true,
      subscribers,
      enquiries,
      applications
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve admin data.' });
  }
});

// Serve frontend pages directly for clean URLs without .html
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/products', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'products.html'));
});

app.get('/network', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'network.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start the server
async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  KIRTI GOLD SERVER RUNNING ON PORT ${PORT}`);
    console.log(`  Local URL: http://localhost:${PORT}`);
    console.log(`  Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`==================================================`);
  });
}

startServer();
