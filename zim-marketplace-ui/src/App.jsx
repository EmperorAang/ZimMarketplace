import * as signalR from '@microsoft/signalr'
import { useCallback, useEffect, useState } from 'react'
import './App.css'

function App() {
  const [listings, setListings] = useState([])
  const [myListings, setMyListings] = useState([])
  const [adminData, setAdminData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Navigation & Theme State
  const [activeTab, setActiveTab] = useState('catalog')
  const [theme, setTheme] = useState('dark')

  // Auth State
  const [token, setToken] = useState(localStorage.getItem('zim_jwt') || '')
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('zim_user')
    return saved ? JSON.parse(saved) : null
  })
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  
  // Auth Form Inputs
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authFullName, setAuthFullName] = useState('')
  const [authPhone, setAuthPhone] = useState('')

  // Toast Notification State
  const [toast, setToast] = useState(null)

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [filterLocation, setFilterLocation] = useState('All')

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [instantBuyPrice, setInstantBuyPrice] = useState('') 
  const [currency, setCurrency] = useState('USD')
  const [location, setLocation] = useState('Harare')
  const [listingType, setListingType] = useState('Instant') 
  const [durationHours, setDurationHours] = useState('24') 

  // Modal State
  const [activeBidHistoryItem, setActiveBidHistoryItem] = useState(null)
  const [bidAmounts, setBidAmounts] = useState({})
  const [displayCurrency, setDisplayCurrency] = useState('USD')
  const [now, setNow] = useState(new Date()) 
  const exchangeRate = 25.5 

  const isDark = theme === 'dark'
  const colors = {
    bg: isDark ? '#0f172a' : '#f8fafc',
    cardBg: isDark ? '#1e293b' : '#ffffff',
    border: isDark ? '#334155' : '#e2e8f0',
    inputBg: isDark ? '#0f172a' : '#f1f5f9',
    textMain: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    headerBorder: isDark ? '#334155' : '#cbd5e1'
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getAuthHeaders = () => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  const parseJsonSafely = async (response) => {
    const text = await response.text()
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 7000)
  }, [])

  const fetchListings = useCallback((showLoadingIndicator = false) => {
    if (showLoadingIndicator) setLoading(true);
    fetch('http://localhost:5159/api/listings')
      .then(async (res) => {
        const data = await parseJsonSafely(res)
        if (!res.ok) throw new Error((data && data.message) || 'Failed to load listings')
        return Array.isArray(data) ? data : []
      })
      .then(data => {
        const mappedData = data.map(item => ({
          ...item,
          id: item.id || item.Id,
          listingType: item.listingType || item.ListingType || 'Instant',
          currentBid: item.currentBid ?? item.CurrentBid ?? item.basePrice ?? item.BasePrice,
          basePrice: item.basePrice ?? item.BasePrice,
          instantBuyPrice: item.instantBuyPrice ?? item.InstantBuyPrice,
          endTime: item.endTime || item.EndTime,
          sellerName: item.seller?.fullName || 'Verified Seller',
          bids: item.bids || []
        }))
        setListings(mappedData)
        setLoading(false)
      })
      .catch(err => {
        console.error("Error fetching catalog:", err)
        setLoading(false)
      })
  }, [])

  const fetchMyListings = useCallback(() => {
    const storedToken = localStorage.getItem('zim_jwt') || token;
    if (!storedToken) {
      setMyListings([]);
      return;
    }

    fetch('http://localhost:5159/api/listings/my', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storedToken}`
      }
    })
      .then(async (res) => {
        const data = await parseJsonSafely(res)
        if (!res.ok) throw new Error((data && data.message) || 'Unauthorized')
        return Array.isArray(data) ? data : []
      })
      .then(data => setMyListings(data))
      .catch(err => {
        console.error("Error fetching seller dashboard:", err);
        setMyListings([]);
      });
  }, [token])

  const fetchAdminOverview = useCallback(() => {
    const storedToken = localStorage.getItem('zim_jwt') || token;
    if (!storedToken) return;
    fetch('http://localhost:5159/api/listings/admin/all', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storedToken}`
      }
    })
      .then(async (res) => {
        const data = await parseJsonSafely(res)
        if (!res.ok) throw new Error((data && data.message) || 'Unable to load admin overview')
        return data
      })
      .then(data => setAdminData(data))
      .catch(err => console.error("Error fetching admin overview:", err))
  }, [token])

  const handleAdminCancel = (listingId) => {
    if (!confirm("Are you sure you want to administratively cancel this listing?")) return;
    fetch(`http://localhost:5159/api/listings/admin/${listingId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
      .then(res => {
        if (res.ok) {
          showToast("Listing cancelled by Admin", "warning")
          fetchAdminOverview()
          fetchListings(false)
        }
      })
  }

  // Initial data fetch on mount and when token/currentUser changes
  useEffect(() => {
    const loadInitialData = async () => {
      fetchListings(true);
      if (token) fetchMyListings();
      if (currentUser?.role === 'Admin') fetchAdminOverview();
    };
    loadInitialData();
  }, [token, currentUser, fetchListings, fetchMyListings, fetchAdminOverview])

  // SignalR connection setup
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl("http://localhost:5159/hubs/auction")
      .withAutomaticReconnect()
      .build();

    connection.start()
      .then(() => console.log("Connected to Real-Time SignalR Auction Hub"))
      .catch(err => console.error("SignalR Connection Error:", err));

    connection.on("ReceiveNewBid", (data) => {
      fetchListings(false);
      if (token) fetchMyListings();

      if (data && currentUser && data.previousBidderId === currentUser.userId) {
        showToast(`⚠️ You've been outbid! Current bid is now ${data.newBid}`, 'warning');
      } else if (data && currentUser && data.bidderName !== currentUser.fullName) {
        showToast(`🔨 New bid placed on an active auction!`, 'info');
      }
    });

    connection.on("CatalogUpdated", () => {
      fetchListings(false);
      if (token) fetchMyListings();
      if (currentUser?.role === 'Admin') fetchAdminOverview();
    });

    return () => {
      connection.stop();
    }
  }, [token, currentUser, fetchListings, fetchMyListings, fetchAdminOverview, showToast])

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    const endpoint = authMode === 'login' ? 'login' : 'register'
    const body = authMode === 'login' 
      ? { email: authEmail, password: authPassword }
      : { fullName: authFullName, email: authEmail, password: authPassword, phoneNumber: authPhone }

    try {
      const res = await fetch(`http://localhost:5159/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Authentication failed')

      setToken(data.token)
      setCurrentUser(data)
      localStorage.setItem('zim_jwt', data.token)
      localStorage.setItem('zim_user', JSON.stringify(data))
      
      setShowAuthModal(false)
      setAuthPassword('')
      showToast(`Welcome, ${data.fullName}! Logged in as ${data.role || 'User'}.`, 'success')
      
      // Refresh personalized dashboards
      fetchMyListings()
    } catch (err) {
      alert(`Auth Error: ${err.message}`)
    }
  }

  const handleLogout = () => {
    setToken('')
    setCurrentUser(null)
    setMyListings([])
    setAdminData(null)
    localStorage.removeItem('zim_jwt')
    localStorage.removeItem('zim_user')
    setActiveTab('catalog')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!currentUser) return setShowAuthModal(true)
    if (!title || !basePrice) return alert("Title and Price are required!")

    const calculatedEndTime = (listingType === 'Auction' || listingType === 'Hybrid') 
      ? new Date(Date.now() + parseFloat(durationHours) * 60 * 60 * 1000).toISOString()
      : null;

    const newListing = {
      title,
      description,
      basePrice: parseFloat(basePrice),
      currency,
      location,
      listingType, 
      currentBid: parseFloat(basePrice),
      instantBuyPrice: (listingType === 'Hybrid' && instantBuyPrice) ? parseFloat(instantBuyPrice) : null,
      endTime: calculatedEndTime,
      status: 'Active'
    }

    fetch('http://localhost:5159/api/listings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newListing)
    })
    .then(async (res) => {
      const data = await parseJsonSafely(res)
      if (!res.ok) throw new Error((data && data.message) || 'Failed to create listing')

      setTitle('')
      setDescription('')
      setBasePrice('')
      setInstantBuyPrice('')
      showToast("Listing created successfully!", "success")
      fetchListings(true)
      fetchMyListings()
    })
    .catch(err => console.error("Error posting listing:", err))
  }

  const handleCheckout = async (item, isInstantBuyPrice = false) => {
    if (!currentUser) return setShowAuthModal(true)
    const targetItemId = item.id || item.Id;
    const rawPrice = isInstantBuyPrice ? (item.instantBuyPrice || item.basePrice) : item.basePrice;

    const checkoutAmount = displayCurrency === 'USD' && item.currency === 'ZiG'
      ? rawPrice / exchangeRate
      : displayCurrency === 'ZiG' && item.currency === 'USD'
      ? rawPrice * exchangeRate
      : rawPrice;

    const paymentPayload = {
      listingId: targetItemId,
      amount: parseFloat(checkoutAmount.toFixed(2)),
      currency: displayCurrency
    };

    try {
      const payRes = await fetch('http://localhost:8080/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentPayload)
      });

      const payData = await parseJsonSafely(payRes)
      if (!payRes.ok) throw new Error((payData && payData.message) || 'Payment failed');

      const buyRes = await fetch(`http://localhost:5159/api/listings/${targetItemId}/buy`, { 
        method: 'POST',
        headers: getAuthHeaders()
      });
      const buyData = await parseJsonSafely(buyRes)
      if (!buyRes.ok) throw new Error((buyData && buyData.message) || 'Purchase failed');

      alert(`Checkout Status: ${payData.status}\nTransaction ID: ${payData.transactionId}\n\nItem purchased successfully by ${currentUser.fullName}!`);
      fetchListings(false);
      fetchMyListings();
    } catch (err) {
      alert(`Checkout Error: ${err.message}`);
    }
  };

  const handlePlaceBid = (item) => {
    if (!currentUser) return setShowAuthModal(true)
    const targetItemId = item.id || item.Id;
    const enteredBid = parseFloat(bidAmounts[targetItemId]);
    if (!enteredBid || isNaN(enteredBid)) return alert("Please enter a valid bid amount.");

    let normalizedBid = enteredBid;
    if (displayCurrency === 'USD' && item.currency === 'ZiG') normalizedBid = enteredBid * exchangeRate;
    else if (displayCurrency === 'ZiG' && item.currency === 'USD') normalizedBid = enteredBid / exchangeRate;

    if (normalizedBid <= item.currentBid) return alert(`Bid must be higher than current price!`);

    fetch(`http://localhost:5159/api/listings/${targetItemId}/bid`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ amount: normalizedBid })
    })
      .then(async (res) => {
        const data = await parseJsonSafely(res)
        if (!res.ok) throw new Error((data && data.message) || 'Failed to place bid')
        return data
      })
      .then(() => {
        setBidAmounts(prev => ({ ...prev, [targetItemId]: '' }));
        showToast("Bid placed successfully!", "success")
        fetchListings(false);
        fetchMyListings();
      })
      .catch(err => alert(`Bidding Failed: ${err.message}`));
  };

  const formatValue = (value, baseCurrency) => {
    let finalPrice = value;
    let finalCurrency = displayCurrency;
    if (baseCurrency === 'USD' && displayCurrency === 'ZiG') finalPrice = value * exchangeRate;
    else if (baseCurrency === 'ZiG' && displayCurrency === 'USD') finalPrice = value / exchangeRate;
    return `${finalCurrency} ${finalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatPrice = (item, useCurrentBid = false) => formatValue(useCurrentBid ? item.currentBid : item.basePrice, item.currency);

  const getTimeRemaining = (endTimeStr) => {
    if (!endTimeStr) return null;
    const total = Date.parse(endTimeStr) - now.getTime();
    if (total <= 0) return { expired: true, text: 'Auction Ended' };
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    return { expired: false, text: `${hours}h ${minutes}m ${seconds}s` };
  }

  const filteredListings = listings.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'All' || item.listingType === filterType;
    const matchesLocation = filterLocation === 'All' || item.location === filterLocation;
    return matchesSearch && matchesType && matchesLocation;
  });

  const totalRevenueUSD = myListings.filter(i => i.status === 'Sold').reduce((sum, item) => sum + (item.currentBid || item.basePrice), 0);

  return (
    <div style={{ backgroundColor: colors.bg, padding: '40px 20px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif', color: colors.textMain, minHeight: '100vh', transition: 'background-color 0.3s, color 0.3s' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', marginBottom: '30px', paddingBottom: '20px', borderBottom: `1px solid ${colors.headerBorder}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: '800', background: 'linear-gradient(to right, #0284c7, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Zim Marketplace
          </h1>
          <p style={{ margin: '5px 0 0 0', color: colors.textMuted, fontSize: '0.95rem' }}>Dynamic Real-Time Multi-Currency Trade & Auction Portal</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          
          <button 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.cardBg, color: colors.textMain, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
          >
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>

          {/* USER AUTHENTICATION PROFILE BADGE */}
          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: colors.cardBg, padding: '6px 14px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: '1.4rem' }}>{currentUser.role === 'Admin' ? '🛡️' : '👨‍💻'}</span>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: colors.textMain }}>
                  {currentUser.fullName} {currentUser.role === 'Admin' && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>(Admin)</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#0284c7', cursor: 'pointer', textDecoration: 'underline' }} onClick={handleLogout}>Log Out</div>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              style={{ padding: '8px 16px', borderRadius: '10px', backgroundColor: '#0284c7', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Sign In / Register
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: colors.cardBg, padding: '6px 12px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
            <label style={{ fontWeight: '600', fontSize: '0.85rem', color: colors.textMuted }}>Currency:</label>
            <select 
              value={displayCurrency} 
              onChange={(e) => setDisplayCurrency(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, fontSize: '0.85rem', fontWeight: 'bold' }}
            >
              <option value="USD">USD ($)</option>
              <option value="ZiG">ZiG</option>
            </select>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('catalog')}
          style={{ padding: '10px 20px', borderRadius: '10px', border: `1px solid ${activeTab === 'catalog' ? '#0284c7' : colors.border}`, backgroundColor: activeTab === 'catalog' ? '#0284c7' : colors.cardBg, color: activeTab === 'catalog' ? '#ffffff' : colors.textMain, fontWeight: 'bold', cursor: 'pointer' }}
        >
          🌐 Active Catalog ({listings.length})
        </button>
        
        <button 
          onClick={() => {
            if (!currentUser) return setShowAuthModal(true);
            setActiveTab('dashboard');
            fetchMyListings();
          }}
          style={{ 
            padding: '10px 20px', 
            borderRadius: '10px', 
            border: `1px solid ${activeTab === 'dashboard' ? '#6366f1' : colors.border}`, 
            backgroundColor: activeTab === 'dashboard' ? '#6366f1' : colors.cardBg, 
            color: activeTab === 'dashboard' ? '#ffffff' : colors.textMain, 
            fontWeight: 'bold', 
            cursor: 'pointer' 
          }}
        >
          📊 My Seller Dashboard ({currentUser ? myListings.length : 0})
        </button>

        {currentUser?.role === 'Admin' && (
          <button 
            onClick={() => {
              setActiveTab('admin')
              fetchAdminOverview()
            }}
            style={{ padding: '10px 20px', borderRadius: '10px', border: `1px solid ${activeTab === 'admin' ? '#ef4444' : colors.border}`, backgroundColor: activeTab === 'admin' ? '#ef4444' : colors.cardBg, color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🛡️ Admin Command Portal
          </button>
        )}
      </div>

      {activeTab === 'catalog' ? (
        <>
          {/* SEARCH & FILTER BAR */}
          <section style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '30px', backgroundColor: colors.cardBg, padding: '16px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
            <input 
              type="text" 
              placeholder="🔍 Search active items..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: '3', minWidth: '200px', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ flex: '1', padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: '#0284c7', fontWeight: 'bold' }}>
              <option value="All">All Types</option>
              <option value="Instant">Instant Buy</option>
              <option value="Auction">Auction Only</option>
              <option value="Hybrid">Hybrid</option>
            </select>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ flex: '1', padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }}>
              <option value="All">All Locations</option>
              <option value="Harare">Harare</option>
              <option value="Bulawayo">Bulawayo</option>
              <option value="Mutare">Mutare</option>
            </select>
          </section>

          {/* CREATE LISTING FORM */}
          <section style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}`, marginBottom: '40px' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.4rem', fontWeight: '700' }}>List a New Item</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input type="text" placeholder="Title..." value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }} />
              <textarea placeholder="Description..." value={description} onChange={e => setDescription(e.target.value)} style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, minHeight: '60px' }} />
              
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <input type="number" step="0.01" placeholder={listingType === 'Instant' ? "Price" : "Starting Bid"} value={basePrice} onChange={e => setBasePrice(e.target.value)} style={{ flex: '2', padding: '12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }} />

                {listingType === 'Hybrid' && (
                  <input type="number" step="0.01" placeholder="Buyout Price" value={instantBuyPrice} onChange={e => setInstantBuyPrice(e.target.value)} style={{ flex: '2', padding: '12px', borderRadius: '10px', border: '1px solid #0284c7', backgroundColor: colors.inputBg, color: colors.textMain }} />
                )}

                {(listingType === 'Auction' || listingType === 'Hybrid') && (
                  <select value={durationHours} onChange={e => setDurationHours(e.target.value)} style={{ flex: '1.2', padding: '12px', borderRadius: '10px', border: '1px solid #d97706', backgroundColor: colors.inputBg, color: '#d97706', fontWeight: 'bold' }}>
                    <option value="0.0166">1 Min Test</option>
                    <option value="1">1 Hour</option>
                    <option value="24">24 Hours</option>
                  </select>
                )}

                <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }}>
                  <option value="USD">USD</option>
                  <option value="ZiG">ZiG</option>
                </select>
                <select value={listingType} onChange={e => setListingType(e.target.value)} style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: '#0284c7', fontWeight: 'bold' }}>
                  <option value="Instant">Instant Buy</option>
                  <option value="Auction">Auction Only</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
                <select value={location} onChange={e => setLocation(e.target.value)} style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }}>
                  <option value="Harare">Harare</option>
                  <option value="Bulawayo">Bulawayo</option>
                  <option value="Mutare">Mutare</option>
                </select>
              </div>
              
              <button type="submit" style={{ padding: '14px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                {currentUser ? `Publish Listing as ${currentUser.fullName}` : 'Sign In to Publish Item'}
              </button>
            </form>
          </section>

          {/* CATALOG GRID */}
          <section>
            <h2 style={{ margin: '0 0 24px 0', fontSize: '1.6rem', fontWeight: '700' }}>Active Catalog ({filteredListings.length})</h2>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: colors.textMuted }}>Loading catalog...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {filteredListings.map(item => {
                  const itemId = item.id || item.Id;
                  const isBuyoutDisabled = item.listingType === 'Hybrid' && item.currentBid >= (item.instantBuyPrice || item.basePrice);
                  const timerInfo = getTimeRemaining(item.endTime);

                  return (
                    <div key={itemId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '16px', backgroundColor: colors.cardBg }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: colors.textMain }}>{item.title}</h3>
                          <span style={{ backgroundColor: colors.inputBg, padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', color: colors.textMuted }}>📍 {item.location}</span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ backgroundColor: item.listingType === 'Auction' ? 'rgba(2, 132, 199, 0.15)' : item.listingType === 'Hybrid' ? 'rgba(124, 58, 237, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: item.listingType === 'Auction' ? '#0284c7' : item.listingType === 'Hybrid' ? '#7c3aed' : '#10b981', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                            {item.listingType === 'Auction' ? '🔨 Auction' : item.listingType === 'Hybrid' ? '🔮 Hybrid' : '⚡ Instant Buy'}
                          </span>

                          {timerInfo && (
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: timerInfo.expired ? '#ef4444' : '#d97706', backgroundColor: timerInfo.expired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(217, 119, 6, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                              {timerInfo.expired ? '🚫 Expired' : `⏳ ${timerInfo.text}`}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginBottom: '12px' }}>
                          Seller: <strong style={{ color: colors.textMain }}>{item.sellerName}</strong>
                        </div>

                        <p style={{ color: colors.textMuted, fontSize: '0.9rem', margin: '0 0 20px 0' }}>{item.description}</p>
                      </div>

                      <div>
                        {item.listingType === 'Instant' && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${colors.border}`, marginBottom: '16px' }}>
                            <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Price</span>
                            <strong style={{ color: '#10b981', fontSize: '1.4rem' }}>{formatPrice(item)}</strong>
                          </div>
                        )}

                        {(item.listingType === 'Auction' || item.listingType === 'Hybrid') && (
                          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Current Bid</span>
                              <strong style={{ color: '#0284c7', fontSize: '1.2rem' }}>{formatPrice(item, true)}</strong>
                            </div>
                            
                            <button onClick={() => setActiveBidHistoryItem(item)} style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}>
                              📜 Persistent Bid Log ({item.bids ? item.bids.length : 0})
                            </button>

                            {item.listingType === 'Hybrid' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Instant Buyout</span>
                                <strong style={{ color: isBuyoutDisabled ? '#ef4444' : '#7c3aed', fontSize: '1.1rem', textDecoration: isBuyoutDisabled ? 'line-through' : 'none' }}>
                                  {formatValue(item.instantBuyPrice || item.basePrice * 1.5, item.currency)}
                                </strong>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {(item.listingType === 'Auction' || item.listingType === 'Hybrid') && !timerInfo?.expired && (
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <input 
                              type="number" 
                              step="0.01" 
                              placeholder={`Min Bid: ${formatPrice(item, true)}`}
                              value={bidAmounts[itemId] || ''}
                              onChange={(e) => setBidAmounts(prev => ({ ...prev, [itemId]: e.target.value }))}
                              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }}
                            />
                            <button onClick={() => handlePlaceBid(item)} style={{ padding: '10px 16px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>
                              Bid
                            </button>
                          </div>
                        )}

                        {(item.listingType === 'Instant' || (item.listingType === 'Hybrid' && !isBuyoutDisabled)) && (
                          <button onClick={() => handleCheckout(item, item.listingType === 'Hybrid')} style={{ width: '100%', padding: '12px', backgroundColor: item.listingType === 'Hybrid' ? '#7c3aed' : '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                            {item.listingType === 'Hybrid' ? '⚡ Instant Buyout' : 'Buy Now'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : activeTab === 'dashboard' ? (
        /* ISOLATED SELLER DASHBOARD VIEW */
        <section style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}` }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.6rem', fontWeight: '700' }}>📊 Personal Seller Dashboard</h2>
          <p style={{ margin: '0 0 30px 0', color: colors.textMuted }}>Isolated metrics for <strong>{currentUser ? currentUser.fullName : 'Seller'}</strong></p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>My Revenue</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#10b981', marginTop: '6px' }}>${totalRevenueUSD.toFixed(2)} USD</div>
            </div>
            <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>My Created Listings</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0284c7', marginTop: '6px' }}>{myListings.length}</div>
            </div>
            <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
              <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>My Items Sold</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#7c3aed', marginTop: '6px' }}>{myListings.filter(i => i.status === 'Sold').length}</div>
            </div>
          </div>

          <h3 style={{ margin: '0 0 20px 0' }}>Listing Audit Logs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {myListings.length > 0 ? myListings.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: colors.inputBg, borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{item.title}</div>
                  <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Type: {item.listingType} | Location: {item.location}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ backgroundColor: item.status === 'Sold' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(2, 132, 199, 0.2)', color: item.status === 'Sold' ? '#10b981' : '#0284c7', padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {item.status}
                  </span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginTop: '4px' }}>{formatPrice(item, true)}</div>
                </div>
              </div>
            )) : (
              <div style={{ color: colors.textMuted, textAlign: 'center', padding: '20px' }}>You have not created any listings yet.</div>
            )}
          </div>
        </section>
      ) : (
        /* SYSTEM ADMIN COMMAND PORTAL */
        adminData && (
          <section style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}` }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '1.6rem', fontWeight: '700', color: '#ef4444' }}>🛡️ System Admin Command Center</h2>
            <p style={{ margin: '0 0 30px 0', color: colors.textMuted }}>Global platform analytics and administrative override controls</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
              <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>Total Platform Revenue</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#10b981', marginTop: '6px' }}>${adminData.totalPlatformRevenue?.toFixed(2)} USD</div>
              </div>
              <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>Total Created Listings</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0284c7', marginTop: '6px' }}>{adminData.totalCreatedListings}</div>
              </div>
              <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>Active Listings</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#7c3aed', marginTop: '6px' }}>{adminData.activeListingsCount}</div>
              </div>
              <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: '0.85rem', color: colors.textMuted }}>Registered Accounts</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#d97706', marginTop: '6px' }}>{adminData.totalUsersCount}</div>
              </div>
            </div>

            <h3 style={{ margin: '0 0 20px 0' }}>All Platform Listings (Moderation & Override)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {adminData.listings?.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: colors.inputBg, borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{item.title}</div>
                    <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>Seller: {item.seller?.fullName || 'Unknown'} | Status: <strong>{item.status}</strong></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: 'bold' }}>USD {item.currentBid || item.basePrice}</span>
                    {item.status === 'Active' && (
                      <button onClick={() => handleAdminCancel(item.id)} style={{ padding: '6px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        Cancel Listing
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      )}

      {/* LIVE TOAST OVERLAY */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: toast.type === 'warning' ? '#b91c1c' : toast.type === 'success' ? '#15803d' : '#0284c7', color: '#ffffff', padding: '14px 20px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 2000, fontWeight: '600', fontSize: '0.95rem' }}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>✕</button>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuthModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '400px', width: '90%', border: `1px solid ${colors.border}` }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.4rem', color: colors.textMain }}>
              {authMode === 'login' ? '🔐 Sign In' : '📝 Register Account'}
            </h3>
            
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {authMode === 'register' && (
                <>
                  <input type="text" placeholder="Full Name" value={authFullName} onChange={e => setAuthFullName(e.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }} />
                  <input type="tel" placeholder="Phone (+263...)" value={authPhone} onChange={e => setAuthPhone(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }} />
                </>
              )}
              
              <input type="email" placeholder="Email Address" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }} />
              <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }} />

              <button type="submit" style={{ padding: '12px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.85rem', color: colors.textMuted }}>
              {authMode === 'login' ? "Don't have an account? " : "Already registered? "}
              <span onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ color: '#0284c7', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>
                {authMode === 'login' ? 'Register here' : 'Sign in here'}
              </span>
            </div>

            <button onClick={() => setShowAuthModal(false)} style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', color: colors.textMuted, border: 'none', marginTop: '10px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PERSISTENT BID LOG MODAL */}
      {activeBidHistoryItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '450px', width: '90%', border: `1px solid ${colors.border}` }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.3rem', color: colors.textMain }}>📜 Persistent Bid Log</h3>
            <p style={{ margin: '0 0 20px 0', color: colors.textMuted, fontSize: '0.9rem' }}>Item: <strong>{activeBidHistoryItem.title}</strong></p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '250px', overflowY: 'auto' }}>
              {activeBidHistoryItem.bids && activeBidHistoryItem.bids.length > 0 ? (
                activeBidHistoryItem.bids.slice().reverse().map((bid, idx) => {
                  const timestampStr = bid.bidTime || bid.BidTime || bid.timestamp;
                  return (
                    <div key={bid.id || idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: colors.inputBg, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#0284c7' }}>
                          Verified Bidder
                        </div>
                        <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
                          {timestampStr ? new Date(timestampStr).toLocaleTimeString() : 'Recent'}
                        </div>
                      </div>
                      <strong style={{ color: '#10b981' }}>
                        {formatValue(bid.amount || bid.Amount, activeBidHistoryItem.currency || 'USD')}
                      </strong>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: '16px', textAlign: 'center', color: colors.textMuted, fontSize: '0.9rem' }}>
                  No bids recorded in database yet. Starting baseline: {formatValue(activeBidHistoryItem.basePrice, activeBidHistoryItem.currency)}
                </div>
              )}
            </div>

            <button onClick={() => setActiveBidHistoryItem(null)} style={{ width: '100%', padding: '12px', backgroundColor: colors.headerBorder, color: colors.textMain, border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              Close History
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App