const API_BASE = "https://fmp-proxy.swapnil-fmp.workers.dev";



// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDleYu0e32JWi12gXcfjdcaDUkMc4c2Si8",
  authDomain: "website1-a5f25.firebaseapp.com",
  projectId: "website1-a5f25",
  storageBucket: "website1-a5f25.appspot.com",
  messagingSenderId: "307498239266",
  appId: "1:307498239266:web:4c5636721d61d4bf2f517b",
  measurementId: "G-D2XZGT30FW"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();


// Application State
let currentUser = null;
let currentPage = 'dashboard';
let isAuthenticated = false;
let darkMode = false;
let autoRefresh = false;
let refreshInterval = null;
let userWatchlist = [];
let userPortfolio = [];

// Chart.js global chart instances to prevent crashes/memory leaks
let portfolioChartInstance = null;
let allocationChartInstance = null;


// Global price cache TTL (ms)
const PRICE_TTL = 60000; // 60 seconds cache

// Market indices cache
const INDICES_TTL = 60000; // 60 seconds
const indicesCache = {
    data: null,
    updatedAt: 0
};
window.indicesCache = indicesCache;

// Sample/Demo Data
const sampleStocks = [
    {
        symbol: "AAPL",
        name: "Apple Inc.",
        currentPrice: 185.20,
        change: 2.15,
        changePercent: 1.17,
        volume: 45678900,
        marketCap: 2890000000000,
        pe: 29.5,
        sector: "Technology"
    },
    {
        symbol: "MSFT",
        name: "Microsoft Corporation",
        currentPrice: 345.80,
        change: -4.50,
        changePercent: -1.28,
        volume: 23456789,
        marketCap: 2560000000000,
        pe: 32.1,
        sector: "Technology"
    },
    {
        symbol: "GOOGL",
        name: "Alphabet Inc.",
        currentPrice: 142.30,
        change: 1.85,
        changePercent: 1.32,
        volume: 34567890,
        marketCap: 1800000000000,
        pe: 25.4,
        sector: "Technology"
    },
    {
        symbol: "TSLA",
        name: "Tesla Inc.",
        currentPrice: 248.50,
        change: 12.40,
        changePercent: 5.25,
        volume: 56789012,
        marketCap: 750000000000,
        pe: 65.8,
        sector: "Automotive"
    },
    {
        symbol: "NVDA",
        name: "NVIDIA Corporation",
        currentPrice: 425.60,
        change: 8.90,
        changePercent: 2.14,
        volume: 67890123,
        marketCap: 1050000000000,
        pe: 78.2,
        sector: "Technology"
    }
];

const marketIndices = [
    { symbol: "SPX", name: "S&P 500", value: 0, change: 0, changePercent: 0 },
    { symbol: "IXIC", name: "NASDAQ", value: 0, change: 0, changePercent: 0 },
    { symbol: "DJI", name: "Dow Jones", value: 0, change: 0, changePercent: 0 }
];

const sampleNews = [
    {
        id: 1,
        headline: "Tech Stocks Rally as AI Investment Continues",
        summary: "Major technology companies see significant gains as artificial intelligence investments drive market optimism.",
        source: "Financial Times",
        publishedAt: "2025-01-27T14:30:00Z",
        url: "#",
        category: "technology"
    },
    {
        id: 2,
        headline: "Federal Reserve Signals Potential Rate Changes",
        summary: "Latest Fed meeting minutes suggest possible adjustments to interest rates in response to economic indicators.",
        source: "Reuters",
        publishedAt: "2025-01-27T13:15:00Z",
        url: "#",
        category: "economics"
    },
    {
        id: 3,
        headline: "Electric Vehicle Adoption Accelerates Globally",
        summary: "New data shows record sales of electric vehicles across major markets, boosting automotive sector stocks.",
        source: "Bloomberg",
        publishedAt: "2025-01-27T12:00:00Z",
        url: "#",
        category: "automotive"
    }
];

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    initializeTheme();

    showAppLoading(true);

    // Single source of truth for auth + UI state
    auth.onAuthStateChanged(async function(user) {
        if (user) {
            currentUser = user;
            isAuthenticated = true;
            await loadUserData();
            showMainApp();
            showPage('dashboard');
            // startRealtimePrices(); // realtime polling disabled
        } else {
            currentUser = null;
            isAuthenticated = false;
            showLandingPage();
        }
        showAppLoading(false);
    });
});

function initializeApp() {
    // Check authentication state will be handled by Firebase auth state listener
    console.log('FinanceHub initialized');
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('financeHub_theme');
    if (savedTheme === 'dark') {
        darkMode = true;
        document.documentElement.setAttribute('data-color-scheme', 'dark');
        updateThemeIcons();
    }
    
    const savedAutoRefresh = localStorage.getItem('financeHub_autoRefresh');
    if (savedAutoRefresh === 'true') {
        autoRefresh = true;
        document.getElementById('auto-refresh-toggle').checked = true;
        startAutoRefresh();
    }
}

function setupEventListeners() {
    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.dataset.page;
            showPage(page);
        });
    });

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    // Password strength checker
    const signupPassword = document.getElementById('signup-password');
    if (signupPassword) {
        signupPassword.addEventListener('input', checkPasswordStrength);
    }

    // Stock search
    const stockSearch = document.getElementById('stock-search');
    if (stockSearch) {
        stockSearch.addEventListener('input', debounce(handleStockSearch, 300));
        stockSearch.addEventListener('blur', function() {
            setTimeout(() => {
                document.getElementById('search-results').classList.add('hidden');
            }, 200);
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        const userDropdown = document.getElementById('user-dropdown');
        const userMenu = document.querySelector('.user-menu');
        if (userDropdown && !userMenu.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
    });
}

// Authentication Functions
function showLogin() {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('password-reset-form').classList.add('hidden');
}

function showSignup() {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('password-reset-form').classList.add('hidden');
}

function showLoginForm() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('password-reset-form').classList.add('hidden');
}

function showSignupForm() {
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('password-reset-form').classList.add('hidden');
}

function showPasswordReset() {
    document.getElementById('password-reset-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.add('hidden');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const loginBtn = document.getElementById('login-btn');
    const loginBtnText = document.getElementById('login-btn-text');
    const loginSpinner = document.getElementById('login-spinner');
    
    // Show loading state
    loginBtnText.textContent = 'Signing in...';
    loginSpinner.classList.remove('hidden');
    loginBtn.disabled = true;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        closeAuthModal();
        showToast('Login successful!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showToast(getFirebaseErrorMessage(error), 'error');
    } finally {
        // Reset button state
        loginBtnText.textContent = 'Sign In';
        loginSpinner.classList.add('hidden');
        loginBtn.disabled = false;
    }
}

async function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const signupBtn = document.getElementById('signup-btn');
    const signupBtnText = document.getElementById('signup-btn-text');
    const signupSpinner = document.getElementById('signup-spinner');
    
    // Show loading state
    signupBtnText.textContent = 'Creating account...';
    signupSpinner.classList.remove('hidden');
    signupBtn.disabled = true;
    
    try {
        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update profile
        await user.updateProfile({
            displayName: name
        });
        
        // Store additional user data in Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            watchlist: [],
            portfolio: [],
            preferences: {
                theme: 'light',
                autoRefresh: false,
                notifications: true
            }
        });
        
        closeAuthModal();
        showToast('Account created successfully!', 'success');
    } catch (error) {
        console.error('Signup error:', error);
        showToast(getFirebaseErrorMessage(error), 'error');
    } finally {
        // Reset button state
        signupBtnText.textContent = 'Create Account';
        signupSpinner.classList.add('hidden');
        signupBtn.disabled = false;
    }
}

async function handlePasswordReset(event) {
    event.preventDefault();
    
    const email = document.getElementById('reset-email').value;
    
    try {
        await auth.sendPasswordResetEmail(email);
        showToast('Password reset email sent!', 'success');
        showLoginForm();
    } catch (error) {
        console.error('Password reset error:', error);
        showToast(getFirebaseErrorMessage(error), 'error');
    }
}

function getFirebaseErrorMessage(error) {
    switch (error.code) {
        case 'auth/user-not-found':
            return 'No account found with this email address.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/email-already-in-use':
            return 'An account already exists with this email address.';
        case 'auth/weak-password':
            return 'Password should be at least 6 characters.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        default:
            return error.message;
    }
}

function checkPasswordStrength() {
    const password = document.getElementById('signup-password').value;
    const strengthBar = document.querySelector('.strength-fill');
    const strengthText = document.querySelector('.strength-text');
    
    let strength = 0;
    let text = '';
    let color = '';
    
    if (password.length >= 8) strength += 25;
    if (/[a-z]/.test(password)) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    
    if (strength === 0) {
        text = 'Enter a password';
        color = '#ccc';
    } else if (strength <= 25) {
        text = 'Weak password';
        color = '#ff4444';
    } else if (strength <= 50) {
        text = 'Fair password';
        color = '#ff8800';
    } else if (strength <= 75) {
        text = 'Good password';
        color = '#88aa00';
    } else {
        text = 'Strong password';
        color = '#00aa44';
    }
    
    strengthBar.style.width = strength + '%';
    strengthBar.style.backgroundColor = color;
    strengthText.textContent = text;
}

// User Data Functions
async function loadUserData() {
    if (!currentUser) return;
    
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userWatchlist = userData.watchlist || [];
            userPortfolio = userData.portfolio || [];
            
            // Update UI with user data
            document.getElementById('user-name').textContent = userData.name || currentUser.displayName || 'User';
            document.getElementById('user-email').textContent = currentUser.email;
            
            // Load preferences
            if (userData.preferences) {
                if (userData.preferences.autoRefresh) {
                    autoRefresh = true;
                    document.getElementById('auto-refresh-toggle').checked = true;
                    startAutoRefresh();
                }
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showToast('Error loading user preferences', 'error');
    }
}

async function saveUserData() {
    if (!currentUser || !currentUser.uid) return;
    
    try {
        await db.collection('users').doc(currentUser.uid).update({
            watchlist: userWatchlist,
            portfolio: userPortfolio,
            preferences: {
                theme: darkMode ? 'dark' : 'light',
                autoRefresh: autoRefresh,
                notifications: true
            }
        });
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Page Navigation Functions
function showLandingPage() {
    document.getElementById('landing-page').classList.add('active');
    document.getElementById('main-app').classList.add('hidden');
}

function showMainApp() {
    document.getElementById('landing-page').classList.remove('active');
    document.getElementById('main-app').classList.remove('hidden');

    document.querySelectorAll('.app-page')
        .forEach(p => p.classList.remove('active'));
}

async function showPage(pageName) {
    // Update navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });
    
    // Update page content
    const pages = document.querySelectorAll('.app-page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(`${pageName}-page`).classList.add('active');
    document.getElementById('page-title').textContent = capitalize(pageName);
    
    currentPage = pageName;
    
    // Load page-specific content
    switch(pageName) {
        case 'dashboard':
            loadDashboard();
            break;  
        case 'stocks':
            loadStocksPage();
            break;
        case 'portfolio':
            loadPortfolio();
            break;
        case 'watchlist':
            loadWatchlist();
            break;
        case 'news':
            loadNews();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

function showDemo() {
    // For demo, we'll use sample data without authentication
    isAuthenticated = true;
    userWatchlist = ['AAPL', 'MSFT', 'GOOGL'];
    userPortfolio = ['AAPL', 'TSLA'];
    // Not invoked automatically anywhere
    showMainApp();
    loadDashboard();
    // startRealtimePrices(); // realtime polling disabled
    showToast('Welcome to the demo! All data is simulated.', 'info');
}

// Dashboard Functions
async function loadDashboard() {
    loadMarketIndices();
    loadTopMovers();
    loadRecentActivity();
    initPortfolioChart();

    // Fetch live prices for visible dashboard symbols so the UI shows current data
    // We don't await here to avoid blocking UI render; errors are handled inside fetchLivePrices
    fetchLivePrices();
}

async function loadMarketIndices() {
    const container = document.getElementById('market-indices-list');
    if (!indicesCache.data) {
        container.innerHTML = '';
    }
    
    try {
        // Try to fetch real data first, fall back to sample data
        const indices = await fetchMarketIndices() || marketIndices;
        
        container.innerHTML = '';
        indices.forEach(index => {
            const item = document.createElement('div');
            item.className = 'market-item';
            
            const changeClass = index.change > 0 ? 'positive' : 'negative';
            const changeSign = index.change > 0 ? '+' : '';
            
            item.innerHTML = `
                <span class="market-name">${index.name}</span>
                <div class="market-price">
                    <span>${index.value.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    <span class="market-change ${changeClass}">
                        ${changeSign}${index.change.toFixed(2)} (${changeSign}${index.changePercent.toFixed(2)}%)
                    </span>
                </div>
            `;
            
            container.appendChild(item);
        });
        
        document.getElementById('market-last-update').textContent = `Live • ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error loading market indices:', error);
        container.innerHTML = '<div class="error">Error loading market data</div>';
    }
}

async function loadTopMovers() {
    const container = document.getElementById('top-movers-list');
    showMovers('gainers');
}

function showMovers(type) {
    const container = document.getElementById('top-movers-list');
    const tabs = document.querySelectorAll('.tab-btn');
    
    // Update tab active state
    tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.textContent.toLowerCase() === type) {
            tab.classList.add('active');
        }
    });
    
    // Get movers data
    const movers = type === 'gainers' 
        ? sampleStocks.filter(s => s.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent)
        : sampleStocks.filter(s => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
    
    container.innerHTML = '';
    movers.slice(0, 5).forEach(stock => {
        const item = document.createElement('div');
        item.className = 'mover-item';
        
        const changeClass = stock.changePercent > 0 ? 'positive' : 'negative';
        const changeSign = stock.changePercent > 0 ? '+' : '';
        
        item.innerHTML = `
            <div class="mover-info">
                <span class="mover-symbol">${stock.symbol}</span>
            </div>
            <div class="mover-change">
                <span class="market-change ${changeClass}">
                    ${changeSign}$${Math.abs(stock.change).toFixed(2)}
                </span>
                <span class="market-change ${changeClass}">
                    ${changeSign}${Math.abs(stock.changePercent).toFixed(2)}%
                </span>
            </div>
        `;
        
        container.appendChild(item);
    });
}

function loadRecentActivity() {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    const activities = [
        { icon: 'plus', title: 'Added AAPL to watchlist', time: '2 hours ago' },
        { icon: 'chart-line', title: 'Portfolio updated', time: '4 hours ago' },
        { icon: 'bell', title: 'Price alert triggered for TSLA', time: '1 day ago' },
        { icon: 'sync', title: 'Auto-refresh enabled', time: '2 days ago' }
    ];
    
    container.innerHTML = '';
    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        item.innerHTML = `
            <div class="activity-icon">
                <i class="fas fa-${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-time">${activity.time}</div>
            </div>
        `;
        
        container.appendChild(item);
    });
}

function initPortfolioChart() {
    if (currentPage !== 'dashboard') return;
    const ctx = document.getElementById('portfolio-chart');
    if (!ctx) return;

    // Generate sample portfolio performance data
    const dates = [];
    const values = [];
    const baseValue = 50000;

    for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const variation = (Math.random() - 0.5) * 0.02;
        const value = baseValue * (1 + variation * (30 - i) / 30);
        values.push(value + Math.random() * 5000);
    }

    if (portfolioChartInstance) {
        portfolioChartInstance.destroy();
    }

    portfolioChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Portfolio Value',
                data: values,
                borderColor: '#1FB8CD',
                backgroundColor: 'rgba(31, 184, 205, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    }
                }
            }
        }
    });

    // Update portfolio change indicator
    const changeElement = document.getElementById('portfolio-change');
    if (changeElement) {
        const change = 1245.50;
        const changePercent = 2.45;
        const changeClass = change > 0 ? 'positive' : 'negative';
        const changeSign = change > 0 ? '+' : '';

        changeElement.className = `portfolio-change ${changeClass}`;
        changeElement.textContent = `${changeSign}$${Math.abs(change).toFixed(2)} (${changeSign}${Math.abs(changePercent).toFixed(2)}%)`;
    }
}

// Stocks Page Functions
async function loadStocksPage() {
    // 1. Show mock/sample data immediately
    loadPopularStocks();

    // 2. Refresh prices silently in background
    fetchLivePrices();
}

async function loadPopularStocks() {
    const container = document.getElementById('popular-stocks-list');
    // No spinner or loading text; keep mock data visible at all times.
    try {
        // Use sample stocks data
        const stocks = sampleStocks;
        
        container.innerHTML = '';
        stocks.forEach(stock => {
            const item = document.createElement('div');
            item.className = 'stock-item';
            item.onclick = () => showStockDetails(stock.symbol);
            
            const changeClass = stock.changePercent > 0 ? 'positive' : 'negative';
            const changeSign = stock.changePercent > 0 ? '+' : '';
            
            item.innerHTML = `
                <div class="stock-info">
                    <span class="stock-symbol-text">${stock.symbol}</span>
                    <span class="stock-name-text">${stock.name}</span>
                </div>
                <div class="stock-price-info">
                    <span class="stock-price">$${stock.currentPrice.toFixed(2)}</span>
                    <span class="market-change ${changeClass}">
                        ${changeSign}${Math.abs(stock.changePercent).toFixed(2)}%
                    </span>
                </div>
            `;
            
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading popular stocks:', error);
        container.innerHTML = '<div class="error">Error loading stocks data</div>';
    }
}

async function searchDetailedStock() {
    const rawInput = document.getElementById('detailed-stock-search').value.trim();
    if (!rawInput) return;

    const detailsContainer = document.getElementById('stock-details');
    detailsContainer.classList.remove('hidden');
    detailsContainer.innerHTML =
        '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading stock data...</div>';

    try {
        let symbol;

        // Fast path: If input is a valid US symbol, fetch quote directly
        if (/^[A-Z]{1,6}$/.test(rawInput)) {
            const stockData = await fetchStockQuote(rawInput);
            if (stockData) {
                displayStockDetails(stockData);
                return;
            }
            // If not found, fall through to name search
        }

        // Always resolve name → symbol using proxy API
        const searchRes = await fetch(
            `${API_BASE}/search-name?query=${encodeURIComponent(rawInput)}`
        );

        if (!searchRes.ok) {
            detailsContainer.innerHTML = '<div class="error">Stock not found (US equities only)</div>';
            return;
        }

        const searchData = await searchRes.json();
        if (!Array.isArray(searchData) || !searchData.length) {
            detailsContainer.innerHTML = '<div class="error">Stock not found (US equities only)</div>';
            return;
        }

        // Accept US stocks if exchangeShortName or exchange is NASDAQ/NYSE
        const isUsExchange = (item) =>
            (typeof item.exchangeShortName === "string" &&
                (item.exchangeShortName === "NASDAQ" || item.exchangeShortName === "NYSE")) ||
            (typeof item.exchange === "string" &&
                (item.exchange === "NASDAQ" || item.exchange === "NYSE"));

        const exactMatch = searchData.find(item =>
            item.symbol === rawInput.toUpperCase() &&
            isUsExchange(item)
        );

        const usFallback = searchData.find(item =>
            isUsExchange(item) &&
            /^[A-Z]{1,6}$/.test(item.symbol)
        );

        if (exactMatch) {
            symbol = exactMatch.symbol;
        } else if (usFallback) {
            symbol = usFallback.symbol;
        } else {
            detailsContainer.innerHTML = '<div class="error">Stock not found (US equities only)</div>';
            return;
        }

        const stockData = await fetchStockQuote(symbol);
        if (!stockData) {
            detailsContainer.innerHTML = '<div class="error">Stock not found (US equities only)</div>';
            return;
        }

        displayStockDetails(stockData);
    } catch (error) {
        console.error('Error fetching stock details:', error);
        detailsContainer.innerHTML = '<div class="error">Error loading stock data</div>';
    }
}

function displayStockDetails(stock) {
    const container = document.getElementById('stock-details');
    const changeClass = stock.changePercent > 0 ? 'positive' : 'negative';
    const changeSign = stock.changePercent > 0 ? '+' : '';
    const lastUpdated = stock.timestamp
        ? new Date(stock.timestamp * 1000).toLocaleString()
        : 'N/A';

    container.innerHTML = `
    <div class="stock-header">
        <div>
            <div class="stock-symbol">${stock.symbol}</div>
            <div class="stock-name">${stock.name}</div>
            <div class="stock-exchange">${stock.exchange || 'N/A'}</div>
        </div>
        <button class="btn btn--sm btn--primary" onclick="addStockToWatchlist('${stock.symbol}')">
            <i class="fas fa-plus"></i> Add to Watchlist
        </button>
    </div>

    <div class="stock-price">$${Number(stock.currentPrice).toFixed(2)}</div>

    <div class="market-change ${changeClass}">
        ${changeSign}$${Math.abs(stock.change).toFixed(2)} (${changeSign}${Math.abs(stock.changePercent).toFixed(2)}%)
    </div>

    <div class="stock-metrics grid">
        <div class="metric-item">
            <span class="metric-label">Open:</span>
            <span class="metric-value">$${stock.open?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">Previous Close:</span>
            <span class="metric-value">$${stock.previousClose?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">Day Low:</span>
            <span class="metric-value">$${stock.dayLow?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">Day High:</span>
            <span class="metric-value">$${stock.dayHigh?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">52W Low:</span>
            <span class="metric-value">$${stock.yearLow?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">52W High:</span>
            <span class="metric-value">$${stock.yearHigh?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">Market Cap:</span>
            <span class="metric-value">
                ${stock.marketCap ? '$' + (stock.marketCap / 1_000_000_000).toFixed(2) + ' B' : 'N/A'}
            </span>
        </div>

        <div class="metric-item">
            <span class="metric-label">Volume:</span>
            <span class="metric-value">${stock.volume?.toLocaleString() || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">50D Avg:</span>
            <span class="metric-value">$${stock.priceAvg50?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">200D Avg:</span>
            <span class="metric-value">$${stock.priceAvg200?.toFixed(2) || 'N/A'}</span>
        </div>

        <div class="metric-item">
            <span class="metric-label">Last Updated:</span>
            <span class="metric-value">${lastUpdated}</span>
        </div>
    </div>
`;
}

function showStockDetails(symbol) {
    // Switch to stocks page and search for the symbol
    showPage('stocks');
    document.getElementById('detailed-stock-search').value = symbol;
    searchDetailedStock();
}

// Stock Search Functions
async function handleStockSearch(event) {
    const query = event.target.value.trim();
    if (query.length < 1) {
        document.getElementById('search-results').classList.add('hidden');
        return;
    }
    
    const results = await searchStocks(query);
    displaySearchResults(results);
}

function handleSearchEnter(event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim();
        if (query) {
            showStockDetails(query);
        }
    }
}

async function displaySearchResults(stocks) {
    const container = document.getElementById('search-results');
    
    if (!stocks || stocks.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.innerHTML = '';
    stocks.slice(0, 5).forEach(stock => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.onclick = () => {
            showStockDetails(stock.symbol);
            document.getElementById('stock-search').value = '';
            container.classList.add('hidden');
        };
        const priceText = (stock.currentPrice === null || typeof stock.currentPrice === 'undefined')
            ? 'N/A'
            : `$${Number(stock.currentPrice).toFixed(2)}`;

        item.innerHTML = `
            <div>
                <div class="search-symbol">${stock.symbol}</div>
                <div class="search-name">${stock.name}</div>
            </div>
            <div class="search-price">${priceText}</div>
        `;
        
        container.appendChild(item);
    });
    
    container.classList.remove('hidden');
}

// Portfolio Functions
async function loadPortfolio() {
    loadPortfolioSummary();
    loadHoldingsList();
    initAllocationChart();
}

function loadPortfolioSummary() {
    // Calculate portfolio totals
    let totalValue = 0;
    let totalGainLoss = 0;
    
    userPortfolio.forEach(symbol => {
        const stock = sampleStocks.find(s => s.symbol === symbol);
        if (stock) {
            totalValue += stock.currentPrice * 10; // Assume 10 shares each
            totalGainLoss += stock.change * 10;
        }
    });
    
    const gainLossPercent = totalValue > 0 ? (totalGainLoss / (totalValue - totalGainLoss)) * 100 : 0;
    const changeClass = totalGainLoss > 0 ? 'positive' : 'negative';
    const changeSign = totalGainLoss > 0 ? '+' : '';
    
    document.getElementById('portfolio-total-value').textContent = `$${totalValue.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    
    const dailyChangeElement = document.getElementById('portfolio-daily-change');
    if (dailyChangeElement) {
        dailyChangeElement.className = `daily-change ${changeClass}`;
        dailyChangeElement.textContent = `${changeSign}$${Math.abs(totalGainLoss).toFixed(2)} (${changeSign}${Math.abs(gainLossPercent).toFixed(2)}%)`;
    }
}

function loadHoldingsList() {
    const container = document.getElementById('holdings-list');
    container.innerHTML = '';
    
    if (userPortfolio.length === 0) {
        container.innerHTML = '<div class="empty-state">No holdings yet. <a href="#" onclick="showPage(\'stocks\')">Search stocks</a> to get started.</div>';
        return;
    }
    
    userPortfolio.forEach(symbol => {
        const stock = sampleStocks.find(s => s.symbol === symbol);
        if (!stock) return;
        
        const item = document.createElement('div');
        item.className = 'holding-item';
        
        const changeClass = stock.changePercent > 0 ? 'positive' : 'negative';
        const changeSign = stock.changePercent > 0 ? '+' : '';
        
        item.innerHTML = `
            <div class="holding-symbol">
                <span class="symbol">${stock.symbol}</span>
                <span class="company-name">${stock.name}</span>
            </div>
            <span>$${stock.currentPrice.toFixed(2)}</span>
            <div class="holding-change">
                <span class="market-change ${changeClass}">
                    ${changeSign}$${Math.abs(stock.change).toFixed(2)}
                </span>
                <span class="market-change ${changeClass}">
                    ${changeSign}${Math.abs(stock.changePercent).toFixed(2)}%
                </span>
            </div>
            <div class="holding-actions">
                <button class="btn btn--xs btn--outline" onclick="removeFromPortfolio('${stock.symbol}')">Remove</button>
            </div>
        `;
        
        container.appendChild(item);
    });
}

function initAllocationChart() {
    const ctx = document.getElementById('allocation-chart');
    if (!ctx || userPortfolio.length === 0) return;

    const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F'];
    const data = userPortfolio.map((symbol, index) => {
        const stock = sampleStocks.find(s => s.symbol === symbol);
        return {
            label: symbol,
            value: stock ? stock.currentPrice * 10 : 0, // Assume 10 shares
            color: colors[index % colors.length]
        };
    });

    if (allocationChartInstance) {
        allocationChartInstance.destroy();
    }

    allocationChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.label),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: data.map(d => d.color),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                }
            }
        }
    });
}

async function removeFromPortfolio(symbol) {
    userPortfolio = userPortfolio.filter(s => s !== symbol);
    await saveUserData();
    loadPortfolio();
    showToast(`${symbol} removed from portfolio`, 'info');
}

// Watchlist Functions
async function loadWatchlist() {
    const container = document.getElementById('watchlist-stocks-list');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading watchlist...</div>';
    
    try {
        if (userWatchlist.length === 0) {
            container.innerHTML = '<div class="empty-state">Your watchlist is empty. <a href="#" onclick="showAddToWatchlist()">Add stocks</a> to get started.</div>';
            return;
        }
        
        container.innerHTML = '';
        for (const symbol of userWatchlist) {
            const stock = sampleStocks.find(s => s.symbol === symbol);
            if (!stock) continue;
            
            const item = document.createElement('div');
            item.className = 'watchlist-item';
            
            const changeClass = stock.changePercent > 0 ? 'positive' : 'negative';
            const changeSign = stock.changePercent > 0 ? '+' : '';
            
            item.innerHTML = `
                <div class="watchlist-info">
                    <div class="watchlist-symbol">${stock.symbol}</div>
                    <div class="watchlist-name">${stock.name}</div>
                </div>
                <div class="watchlist-price">
                    <div class="watchlist-current-price">$${stock.currentPrice.toFixed(2)}</div>
                    <div class="market-change ${changeClass}">
                        ${changeSign}${Math.abs(stock.changePercent).toFixed(2)}%
                    </div>
                </div>
                <div class="holding-actions">
                    <button class="btn btn--xs btn--primary" onclick="addToPortfolio('${stock.symbol}')">Add to Portfolio</button>
                    <button class="btn btn--xs btn--outline" onclick="removeFromWatchlist('${stock.symbol}')">Remove</button>
                </div>
            `;
            
            container.appendChild(item);
        }
    } catch (error) {
        console.error('Error loading watchlist:', error);
        container.innerHTML = '<div class="error">Error loading watchlist</div>';
    }
}

function showAddToWatchlist() {
    document.getElementById('watchlist-modal').classList.remove('hidden');
    document.getElementById('watchlist-symbol').value = '';
}

function closeWatchlistModal() {
    document.getElementById('watchlist-modal').classList.add('hidden');
}

async function addToWatchlist() {
    const symbol = document.getElementById('watchlist-symbol')?.value?.trim().toUpperCase();
    if (!symbol) {
        showToast('Please enter a stock symbol', 'error');
        return;
    }

    const stockData = sampleStocks.find(s => s.symbol === symbol);
    if (!stockData) {
        showToast('Stock not available yet. Refresh prices first.', 'info');
        return;
    }

    if (userWatchlist.includes(symbol)) {
        showToast('Stock already in watchlist', 'info');
        return;
    }

    userWatchlist.push(symbol);
    await saveUserData();
    closeWatchlistModal();
    loadWatchlist();
    showToast(`${symbol} added to watchlist`, 'success');
}

async function addStockToWatchlist(symbol) {
    if (userWatchlist.includes(symbol)) {
        showToast('Stock already in watchlist', 'info');
        return;
    }
    
    userWatchlist.push(symbol);
    await saveUserData();
    showToast(`${symbol} added to watchlist`, 'success');
}

async function removeFromWatchlist(symbol) {
    userWatchlist = userWatchlist.filter(s => s !== symbol);
    await saveUserData();
    loadWatchlist();
    showToast(`${symbol} removed from watchlist`, 'info');
}

async function addToPortfolio(symbol) {
    if (userPortfolio.includes(symbol)) {
        showToast('Stock already in portfolio', 'info');
        return;
    }
    
    userPortfolio.push(symbol);
    await saveUserData();
    showToast(`${symbol} added to portfolio`, 'success');
}

// News Functions
async function loadNews() {
    const container = document.getElementById('market-news-list');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading market news...</div>';
    
    try {
        // Try to fetch real news, fall back to sample news
        const news = await fetchMarketNews() || sampleNews;
        
        container.innerHTML = '';
        news.forEach(article => {
            const item = document.createElement('div');
            item.className = 'news-item';
            
            const publishedTime = new Date(article.publishedAt).toLocaleString();
            
            item.innerHTML = `
                <div class="news-content">
                    <div class="news-headline">${article.headline}</div>
                    <div class="news-summary">${article.summary}</div>
                    <div class="news-meta">
                        <span class="news-source">${article.source}</span>
                        <span>${publishedTime}</span>
                    </div>
                </div>
            `;
            
            if (article.url && article.url !== '#') {
                item.style.cursor = 'pointer';
                item.onclick = () => window.open(article.url, '_blank');
            }
            
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading news:', error);
        container.innerHTML = '<div class="error">Error loading market news</div>';
    }
}

async function refreshNews() {
    loadNews();
}

// Settings Functions
function loadSettings() {
    // Load current user profile data
    if (currentUser) {
        document.getElementById('profile-name').value = currentUser.displayName || '';
        document.getElementById('profile-email').value = currentUser.email || '';
    }
}

async function updateProfile() {
    const name = document.getElementById('profile-name').value;
    
    if (!name.trim()) {
        showToast('Please enter your name', 'error');
        return;
    }
    
    try {
        await currentUser.updateProfile({
            displayName: name
        });
        
        await db.collection('users').doc(currentUser.uid).update({
            name: name
        });
        
        document.getElementById('user-name').textContent = name;
        showToast('Profile updated successfully', 'success');
    } catch (error) {
        console.error('Error updating profile:', error);
        showToast('Error updating profile', 'error');
    }
}

function toggleAutoRefresh() {
    autoRefresh = document.getElementById('auto-refresh-toggle').checked;
    localStorage.setItem('financeHub_autoRefresh', autoRefresh.toString());
    
    if (autoRefresh) {
        startAutoRefresh();
        showToast('Auto-refresh enabled', 'success');
    } else {
        stopAutoRefresh();
        showToast('Auto-refresh disabled', 'info');
    }
    
    saveUserData();
}

function startAutoRefresh() {
    if (refreshInterval) return;
    
    refreshInterval = setInterval(() => {
        if (currentPage === 'dashboard') {
            // Refresh indices and live prices on the dashboard periodically
            loadMarketIndices();
            // Also fetch live prices for visible symbols so UI stays current
            fetchLivePrices();
            // Top movers refresh only on dashboard open or manual refresh
        } else if (currentPage === 'watchlist') {
            loadWatchlist();
        } else if (currentPage === 'portfolio') {
            loadPortfolio();
        }
        // Stocks page intentionally excluded – refresh only on page open or manual refresh
    }, 30000); // 30 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

async function changePassword() {
    if (!currentUser || !currentUser.email) {
        showToast('Error: User not authenticated', 'error');
        return;
    }
    
    try {
        await auth.sendPasswordResetEmail(currentUser.email);
        showToast('Password reset email sent!', 'success');
    } catch (error) {
        console.error('Error sending password reset:', error);
        showToast('Error sending password reset email', 'error');
    }
}

async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Delete user data from Firestore
        await db.collection('users').doc(currentUser.uid).delete();
        
        // Delete user account
        await currentUser.delete();
        
        showToast('Account deleted successfully', 'info');
    } catch (error) {
        console.error('Error deleting account:', error);
        showToast('Error deleting account. You may need to re-authenticate.', 'error');
    }
}

// API Functions
async function fetchStockQuote(symbol) {
    // Normalize + validate symbol (US equities only)
    if (!symbol) return null;

    symbol = symbol.toUpperCase().trim();

    // Block non‑US / malformed symbols (prevents APLY.NE, MSFO, GOOY, etc.)
    if (!/^[A-Z]{1,6}$/.test(symbol)) {
        console.warn("Blocked invalid symbol:", symbol);
        return null;
    }

    // Serve from cache if fresh
    const cached = sampleStocks.find(s => s.symbol === symbol);
    if (cached && cached._updatedAt && Date.now() - cached._updatedAt < PRICE_TTL) {
        return cached;
    }

    try {
        const res = await fetch(
            `${API_BASE}/quote?symbol=${encodeURIComponent(symbol)}`
        );

        // Hard stop on quota / payment errors
        if (res.status === 402 || res.status === 429) {
            console.warn("FMP quota/payment limit hit. Aborting fetchStockQuote.");
            return cached || null;
        }

        if (!res.ok) {
            return cached || null;
        }

        const api = await res.json();
        // The proxy/upstream may return an array (e.g. [{...}]) for quote endpoints.
        const source = Array.isArray(api) ? api[0] : api;
        if (!source || !source.symbol) {
            return cached || null;
        }

        const stock = {
            symbol: source.symbol,
            name: source.name,
            exchange: source.exchange || source.exchangeShortName || null,

            currentPrice: Number(source.price),
            change: Number(source.change || 0),

            changePercent: Number(
                (source.changesPercentage ?? source.changePercentage ?? 0)
            ),

            open: Number(source.open ?? null),
            previousClose: Number(source.previousClose ?? null),
            dayLow: Number(source.dayLow ?? null),
            dayHigh: Number(source.dayHigh ?? null),
            yearLow: Number(source.yearLow ?? null),
            yearHigh: Number(source.yearHigh ?? null),

            priceAvg50: Number(source.priceAvg50 ?? null),
            priceAvg200: Number(source.priceAvg200 ?? null),

            volume: source.volume ?? null,
            marketCap: source.marketCap ?? null,
            pe: source.pe ?? null,

            timestamp: source.timestamp ?? null,
            _updatedAt: Date.now()
        };

        // Sync cache
        if (cached) {
            Object.assign(cached, stock);
            return cached;
        } else {
            sampleStocks.push(stock);
            return stock;
        }

    } catch (err) {
        console.error("fetchStockQuote failed:", err);
        return cached || null;
    }
}

async function fetchMarketIndices(force = false) {
    // Try to fetch real indices from the worker (which proxies FMP). Fallback to
    // a lightweight client-side approximation if the request fails.
    try {
        // Use cached data if present and not forced
        if (!force && indicesCache.data && Date.now() - indicesCache.updatedAt < INDICES_TTL) {
            return indicesCache.data;
        }

        const res = await fetch(`${API_BASE}/indices`);
        if (!res.ok) throw new Error('Indices fetch failed');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) throw new Error('Invalid indices payload');

        // Normalize shape to match existing marketIndices array
        const normalized = data.map(i => ({
            symbol: i.symbol,
            name: i.name,
            value: Number(i.value || 0),
            change: Number(i.change || 0),
            changePercent: Number(i.changePercent || 0)
        }));

        // Merge into local marketIndices by symbol
        normalized.forEach(n => {
            const idx = marketIndices.find(m => m.symbol === n.symbol);
            if (idx) {
                idx.value = n.value;
                idx.change = n.change;
                idx.changePercent = n.changePercent;
            } else {
                marketIndices.push(n);
            }
        });

        indicesCache.data = marketIndices;
        indicesCache.updatedAt = Date.now();
        return marketIndices;
    } catch (err) {
        console.warn('fetchMarketIndices remote failed, falling back to local approximation:', err.message);

        // Fallback: compute approximate indices from sampleStocks (previous approach)
        try {
            const stocks = sampleStocks.filter(s => typeof s.currentPrice === 'number');
            if (stocks.length === 0) return marketIndices;

            const totalPrice = stocks.reduce((acc, s) => acc + (s.currentPrice || 0), 0);
            const avgPrice = totalPrice / stocks.length;
            const avgChange = stocks.reduce((acc, s) => acc + (s.change || 0), 0) / stocks.length;

            const multipliers = { SPX: 50, IXIC: 120, DJI: 200 };
            marketIndices.forEach(idx => {
                const m = multipliers[idx.symbol] || 50;
                const value = +(avgPrice * m).toFixed(2);
                const change = +(avgChange * m).toFixed(2);
                const changePercent = value - change !== 0 ? +((change / (value - change)) * 100).toFixed(2) : 0;

                idx.value = value;
                idx.change = change;
                idx.changePercent = changePercent;
            });

            indicesCache.data = marketIndices;
            indicesCache.updatedAt = Date.now();
            return marketIndices;
        } catch (innerErr) {
            console.error('Local indices fallback failed:', innerErr);
            return marketIndices;
        }
    }
}

async function fetchMarketNews() {
    try {
        // Try to fetch real market news
        // For demo purposes, return sample news
        return sampleNews;
    } catch (error) {
        console.error('Error fetching market news:', error);
        return sampleNews;
    }
}

// UI Helper Functions
async function refreshAllData() {
    showToast('Refreshing prices...', 'info');
    await fetchLivePrices();

    switch (currentPage) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'stocks':
            loadStocksPage();
            break;
        case 'portfolio':
            loadPortfolio();
            break;
        case 'watchlist':
            loadWatchlist();
            break;
        case 'news':
            loadNews();
            break;
    }
}

function toggleTheme() {
    darkMode = !darkMode;
    
    if (darkMode) {
        document.documentElement.setAttribute('data-color-scheme', 'dark');
        localStorage.setItem('financeHub_theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-color-scheme', 'light');
        localStorage.setItem('financeHub_theme', 'light');
    }
    
    updateThemeIcons();
    saveUserData();
}

function updateThemeIcons() {
    const themeButtons = document.querySelectorAll('.theme-toggle i');
    themeButtons.forEach(icon => {
        if (darkMode) {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('expanded');
}

function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
}

async function logout() {
    stopRealtimePrices();
    try {
        stopAutoRefresh();
        currentUser = null;
        isAuthenticated = false;
        userWatchlist = [];
        userPortfolio = [];
        await auth.signOut();
        showToast('Logged out successfully', 'info');
    } catch (error) {
        console.error('Error logging out:', error);
        showToast('Error logging out', 'error');
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' : 
                 'info-circle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

// Utility Functions
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Global app loading helper
function showAppLoading(state) {
    const loader = document.getElementById('app-loading');
    if (!loader) return;
    loader.classList.toggle('hidden', !state);
}

// Initialize search functionality
async function searchStocks(query) {
    try {
        const res = await fetch(
            `${API_BASE}/search-name?query=${encodeURIComponent(query)}`
        );

        if (!res.ok) return [];

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        // Accept US stocks if exchangeShortName or exchange is NASDAQ/NYSE
        return data
            .filter(item =>
                /^[A-Z]{1,6}$/.test(item.symbol) &&
                (
                    (typeof item.exchangeShortName === "string" &&
                        (item.exchangeShortName === "NASDAQ" || item.exchangeShortName === "NYSE")) ||
                    (typeof item.exchange === "string" &&
                        (item.exchange === "NASDAQ" || item.exchange === "NYSE"))
                )
            )
            .map(item => ({
                symbol: item.symbol,
                name: item.name,
                currentPrice: sampleStocks.find(s => s.symbol === item.symbol)?.currentPrice ?? null
            }));
    } catch (e) {
        console.error("Search failed", e);
        return [];
    }
}
let eventSource = null;

function startRealtimeStream() {
    stopRealtimeStream();
    eventSource = new EventSource(`${API_BASE}/stream`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "trade") {
            bufferPriceUpdate(data.payload.symbol, data.payload.price);
        }
    };
}

function stopRealtimeStream() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
}

function animatePriceChange(el, newPrice, oldPrice) {
    el.classList.remove("price-up", "price-down");
    if (newPrice > oldPrice) el.classList.add("price-up");
    else if (newPrice < oldPrice) el.classList.add("price-down");
    setTimeout(() => el.classList.remove("price-up", "price-down"), 400);
}




/* ================================
   DEV REALTIME PRICE SIMULATION
   ================================ */

// let realtimeInterval = null;
//
// function startRealtimePrices() {
//     if (realtimeInterval) return;
//
//     realtimeInterval = setInterval(() => {
//         if (!window.sampleStocks || !Array.isArray(sampleStocks)) return;
//
//         sampleStocks.forEach(stock => {
//             const oldPrice = stock.currentPrice;
//
//             // small realistic movement
//             const delta = (Math.random() - 0.5) * 2;
//             const newPrice = +(oldPrice + delta).toFixed(2);
//
//             stock.currentPrice = newPrice;
//             stock.change = +(newPrice - oldPrice).toFixed(2);
//             stock.changePercent = +((stock.change / oldPrice) * 100).toFixed(2);
//         });
//
//         // refresh only visible pages
//         switch (currentPage) {
//             case 'dashboard':
//                 loadTopMovers();
//                 break;
//             case 'stocks':
//                 loadPopularStocks();
//                 break;
//             case 'watchlist':
//                 loadWatchlist();
//                 break;
//             case 'portfolio':
//                 loadPortfolio();
//                 break;
//         }
//
//     }, 3000); // every 3 seconds
// }
//
// function stopRealtimePrices() {
//     if (realtimeInterval) {
//         clearInterval(realtimeInterval);
//         realtimeInterval = null;
//     }
// }

/* ================================
   REAL API PRICE UPDATES (FMP)
   ================================ */

let realPriceInterval = null;

function refreshUIAfterPriceUpdate() {
    if (currentPage === 'dashboard') {
        loadMarketIndices();
        loadTopMovers();
    }

    if (currentPage === 'stocks') {
        loadPopularStocks();
    }

    if (currentPage === 'watchlist') {
        loadWatchlist();
    }

    if (currentPage === 'portfolio') {
        loadPortfolioSummary();
        loadHoldingsList();
        initAllocationChart();
    }
}
// realtime polling disabled – manual refresh only

async function fetchLivePrices() {
    try {
        const symbolsToUpdate = new Set(
            [...userWatchlist, ...userPortfolio, ...sampleStocks.map(s => s.symbol)]
                .filter(sym => /^[A-Z]{1,6}$/.test(sym))
        );

        for (const symbol of symbolsToUpdate) {
            const cached = sampleStocks.find(s => s.symbol === symbol);
            if (cached && cached._updatedAt && Date.now() - cached._updatedAt < PRICE_TTL) {
                    console.debug('[fetchLivePrices] skip cached:', symbol);
                    continue;
            }
                console.debug('[fetchLivePrices] fetching:', symbol);
                const res = await fetch(
                    `${API_BASE}/quote?symbol=${encodeURIComponent(symbol)}`
                );

                // debug: log upstream status + which API key the worker used (if present)
                try {
                    const usedKey = res.headers.get('x-fmp-key-used');
                    if (usedKey) console.debug(`[fetchLivePrices] ${symbol} - x-fmp-key-used:`, usedKey);
                } catch (e) {
                    // ignore header read errors
                }

            if (!res.ok) {
                console.warn('[fetchLivePrices] fetch failed for', symbol, 'status=', res.status);
                continue;
            }
            if (res.status === 402 || res.status === 429) {
                console.warn("FMP quota hit. Stopping further requests.");
                break;
            }

            const api = await res.json();
            // Accept arrays from the proxy as well (e.g. [{...}])
            const source = Array.isArray(api) ? api[0] : api;
            if (!source || !source.symbol) continue;

            const oldPrice = cached?.currentPrice || source.price;

            const stock = {
                symbol: source.symbol,
                name: source.name,
                exchange: source.exchange || source.exchangeShortName || null,

                currentPrice: Number(source.price),
                change: Number(source.change || 0),

                changePercent: Number(
                    (source.changesPercentage ?? source.changePercentage ?? 0)
                ),

                open: Number(source.open ?? null),
                previousClose: Number(source.previousClose ?? null),
                dayLow: Number(source.dayLow ?? null),
                dayHigh: Number(source.dayHigh ?? null),
                yearLow: Number(source.yearLow ?? null),
                yearHigh: Number(source.yearHigh ?? null),

                priceAvg50: Number(source.priceAvg50 ?? null),
                priceAvg200: Number(source.priceAvg200 ?? null),

                volume: source.volume ?? null,
                marketCap: source.marketCap ?? null,
                pe: source.pe ?? null,

                timestamp: source.timestamp ?? null,
                _updatedAt: Date.now()
            };

            if (cached) Object.assign(cached, stock);
            else sampleStocks.push(stock);

            await new Promise(r => setTimeout(r, 500)); // rate-safe delay
        }

        refreshUIAfterPriceUpdate();

        const tsEl = document.getElementById('market-last-update');
        if (tsEl) {
            tsEl.textContent = `Live • ${new Date().toLocaleTimeString()}`;
        }
    } catch (err) {
        console.error("Live price fetch failed", err);
    }
}

function startRealtimePrices() {
    // realtime polling intentionally disabled
}

function stopRealtimePrices() {
    // nothing to stop
}