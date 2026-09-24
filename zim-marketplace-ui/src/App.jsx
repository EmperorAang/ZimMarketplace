import * as signalR from '@microsoft/signalr'
import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5159`
const ZIMBABWE_PHONE_REGEX = /^(\+?263|0)7[1378]\d{7}$/

const formatTimestamp = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'N/A'

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Harare',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date)
}

function ListingCardSkeleton() {
  return (
    <div className="listing-skeleton" aria-hidden="true">
      <div className="listing-skeleton__top">
        <div className="listing-skeleton__title" />
        <div className="listing-skeleton__pill" />
      </div>
      <div className="listing-skeleton__type" />
      <div className="listing-skeleton__description" />
      <div className="listing-skeleton__bottom">
        <div className="listing-skeleton__price-label" />
        <div className="listing-skeleton__price" />
        <div className="listing-skeleton__button" />
      </div>
    </div>
  )
}

function App() {
  const [listings, setListings] = useState([])
  const [myListings, setMyListings] = useState([])
  const [wonAuctions, setWonAuctions] = useState([])
  const [selectedWonIds, setSelectedWonIds] = useState([])
  const [activeOutbidAlert, setActiveOutbidAlert] = useState(null)
  const [selectedListingId, setSelectedListingId] = useState(null)
  const [liveBidFeed, setLiveBidFeed] = useState([])
  const [pageBidAmount, setPageBidAmount] = useState('')
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem('zim_cart')
      return savedCart ? JSON.parse(savedCart) : []
    } catch {
      return []
    }
  })
  const [currentView, setCurrentView] = useState('catalog')
  const [adminData, setAdminData] = useState(null)
  const [dashboardError, setDashboardError] = useState('')
  const [adminError, setAdminError] = useState('')
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
  const [profile, setProfile] = useState(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phoneNumber: '',
    city: 'Harare',
    preferredPaymentProvider: 'EcoCash'
  })
  
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
  const [bidLogs, setBidLogs] = useState([])
  const [bidAmounts, setBidAmounts] = useState({})
  const [displayCurrency, setDisplayCurrency] = useState('USD')
  const [paymentProvider, setPaymentProvider] = useState('EcoCash')
  const [now, setNow] = useState(new Date()) 
  const auctionConnectionRef = useRef(null)
  const [exchangeRate, setExchangeRate] = useState(25.5)

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

  useEffect(() => {
    localStorage.setItem('zim_cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/exchange-rates?baseCurrency=USD&quoteCurrency=ZiG`)
      .then(async response => {
        const data = await parseJsonSafely(response)
        if (!response.ok) throw new Error(data?.message || 'Unable to load exchange rate')
        return data
      })
      .then(data => setExchangeRate(Number(data.rate)))
      .catch(error => console.warn('Using fallback exchange rate:', error.message))
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
    fetch(`${API_BASE_URL}/api/listings`)
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

    setDashboardError('')
    fetch(`${API_BASE_URL}/api/listings/my`, {
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
      .then(data => setMyListings(data.map(item => ({
        ...item,
        id: item.id || item.Id,
        title: item.title || item.Title,
        listingType: item.listingType || item.ListingType || 'Instant',
        location: item.location || item.Location,
        status: item.status || item.Status,
        currentBid: item.currentBid ?? item.CurrentBid ?? item.basePrice ?? item.BasePrice,
        basePrice: item.basePrice ?? item.BasePrice,
        currency: item.currency || item.Currency || 'USD'
      }))))
      .catch(err => {
        console.error("Error fetching seller dashboard:", err);
        setMyListings([]);
        setDashboardError(err.message)
      });
  }, [token])

  const fetchWonAuctions = useCallback(() => {
    const storedToken = localStorage.getItem('zim_jwt') || token;
    if (!storedToken) {
      setWonAuctions([])
      return
    }

    fetch(`${API_BASE_URL}/api/listings/won`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storedToken}`
      }
    })
      .then(async (res) => {
        const data = await parseJsonSafely(res)
        if (!res.ok) throw new Error((data && data.message) || 'Unable to load won auctions')
        return Array.isArray(data) ? data : []
      })
      .then(data => {
        setWonAuctions(data)
        setCart(previousCart => {
          const wonById = new Map(data.map(item => [item.id || item.Id, item]))
          const activeWonIds = new Set(wonById.keys())
          const retainedCart = previousCart.filter(item => !item.isWonAuction || activeWonIds.has(item.id))
          const existingIds = new Set(retainedCart.map(item => item.id))
          const newWonItems = data
            .map(item => ({
              id: item.id || item.Id,
              title: item.title || item.Title,
              price: item.currentBid ?? item.CurrentBid ?? item.basePrice ?? item.BasePrice,
              currency: item.currency || item.Currency || 'USD',
              sellerName: item.seller?.fullName || item.Seller?.FullName || 'Verified Seller',
              isWonAuction: true,
              paymentDueDate: item.paymentDueDate || item.PaymentDueDate || null
            }))
            .filter(item => !existingIds.has(item.id))
          return [...retainedCart, ...newWonItems]
        })
      })
      .catch(err => console.error('Error fetching won auctions:', err))
  }, [token])

  const fetchAdminOverview = useCallback(() => {
    const storedToken = localStorage.getItem('zim_jwt') || token;
    if (!storedToken) return;
    setAdminError('')
    fetch(`${API_BASE_URL}/api/listings/admin/all`, {
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
      .then(data => setAdminData({
        totalPlatformRevenue: data.totalPlatformRevenue ?? data.TotalPlatformRevenue ?? 0,
        totalCreatedListings: data.totalCreatedListings ?? data.TotalCreatedListings ?? 0,
        activeListingsCount: data.activeListingsCount ?? data.ActiveListingsCount ?? 0,
        totalUsersCount: data.totalUsersCount ?? data.TotalUsersCount ?? 0,
        listings: (data.listings || data.Listings || []).map(item => ({
          ...item,
          id: item.id || item.Id,
          title: item.title || item.Title,
          status: item.status || item.Status,
          currentBid: item.currentBid ?? item.CurrentBid,
          basePrice: item.basePrice ?? item.BasePrice,
          seller: item.seller || item.Seller
        }))
      }))
      .catch(err => {
        console.error("Error fetching admin overview:", err)
        setAdminData(null)
        setAdminError(err.message)
      })
  }, [token])

  const fetchProfile = useCallback(async () => {
    if (!token) {
      setProfile(null)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await parseJsonSafely(response)
      if (!response.ok) throw new Error((data && data.message) || 'Unable to load profile')

      setProfile(data)
      setProfileForm({
        fullName: data.fullName || '',
        phoneNumber: data.phoneNumber || '',
        city: data.city || 'Harare',
        preferredPaymentProvider: data.preferredPaymentProvider || 'EcoCash'
      })
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
  }, [token])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()

    try {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      })

      const data = await parseJsonSafely(response)
      if (!response.ok) throw new Error((data && data.message) || 'Failed to update profile')

      setProfile(data)
      setCurrentUser(prev => {
        if (!prev) return prev
        const updatedUser = {
          ...prev,
          fullName: data.fullName || prev.fullName,
          phoneNumber: data.phoneNumber || prev.phoneNumber,
          role: data.role || prev.role
        }
        localStorage.setItem('zim_user', JSON.stringify(updatedUser))
        return updatedUser
      })
      setShowProfileModal(false)
      showToast('Profile details updated successfully!', 'success')
    } catch (error) {
      alert(`Error updating profile: ${error.message}`)
    }
  }

  const handleAdminCancel = (listingId) => {
    if (!confirm("Are you sure you want to administratively cancel this listing?")) return;
    fetch(`${API_BASE_URL}/api/listings/admin/${listingId}`, {
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

  const openBidHistory = async (item) => {
    setActiveBidHistoryItem(item)
    setBidLogs([])

    try {
      const response = await fetch(`${API_BASE_URL}/api/listings/${item.id || item.Id}/bids`)
      const data = await parseJsonSafely(response)
      if (!response.ok) throw new Error(data?.message || 'Unable to load bid history')
      setBidLogs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching bid history:', error)
      setBidLogs(item.bids || [])
    }
  }

  const openListingDetail = async (item) => {
    const itemId = item.id || item.Id
    setSelectedListingId(itemId)
    setCurrentView('listing-detail')
    setPageBidAmount('')
    setLiveBidFeed([])

    try {
      const response = await fetch(`${API_BASE_URL}/api/listings/${itemId}/bids`)
      const data = await parseJsonSafely(response)
      if (!response.ok) throw new Error(data?.message || 'Unable to load bid history')
      setLiveBidFeed((Array.isArray(data) ? data : []).map(bid => ({
        id: bid.id || bid.Id,
        bidderName: bid.bidderName || bid.BidderName || 'Verified Bidder',
        amount: bid.amount ?? bid.Amount ?? 0,
        createdAt: bid.createdAt || bid.CreatedAt || bid.bidTime || bid.BidTime
      })))
    } catch (error) {
      console.error('Error loading listing detail:', error)
      showToast(error.message, 'warning')
    }
  }

  const handlePlaceBidOnPage = async (event) => {
    event.preventDefault()
    const item = listings.find(listing => (listing.id || listing.Id) === selectedListingId)
    if (!item) return

    const enteredBid = Number(pageBidAmount)
    if (!enteredBid || Number.isNaN(enteredBid)) return showToast('Enter a valid bid amount.', 'warning')

    let normalizedBid = enteredBid
    if (displayCurrency === 'USD' && item.currency === 'ZiG') normalizedBid = enteredBid * exchangeRate
    if (displayCurrency === 'ZiG' && item.currency === 'USD') normalizedBid = enteredBid / exchangeRate
    if (normalizedBid <= item.currentBid) return showToast('Your bid must be higher than the current bid.', 'warning')

    try {
      const response = await fetch(`${API_BASE_URL}/api/listings/${selectedListingId}/bid`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount: normalizedBid })
      })
      const data = await parseJsonSafely(response)
      if (!response.ok) throw new Error(data?.message || 'Unable to place bid')
      setPageBidAmount('')
      fetchListings(false)
      fetchMyListings()
      showToast('Bid placed successfully!', 'success')
    } catch (error) {
      showToast(error.message, 'warning')
    }
  }

  // Initial data fetch on mount and when authentication changes.
  useEffect(() => {
    const loadInitialData = async () => {
      fetchListings(true);
      if (token) {
        fetchMyListings();
        fetchWonAuctions();
        fetchProfile();
      }
    };
    loadInitialData();
  }, [token, fetchListings, fetchMyListings, fetchWonAuctions, fetchProfile])

  useEffect(() => {
    if (activeTab === 'dashboard' && token) fetchMyListings()
    if (activeTab === 'admin' && token) fetchAdminOverview()
  }, [activeTab, token, fetchMyListings, fetchAdminOverview])

  // SignalR connection setup
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/auction`)
      .withAutomaticReconnect()
      .build();

    connection.start()
      .then(() => {
        auctionConnectionRef.current = connection
        console.log("Connected to Real-Time SignalR Auction Hub")
      })
      .catch(err => console.error("SignalR Connection Error:", err));

    connection.on("ReceiveBidUpdate", (data) => {
      const updatedListingId = data?.itemId || data?.listingId
      setListings(previousListings => previousListings.map(item => {
        const itemId = item.id || item.Id
        return itemId === updatedListingId
          ? { ...item, currentBid: data.currentBid ?? data.newBid, endTime: data.endTime || item.endTime }
          : item
      }))

      if (selectedListingId === updatedListingId) {
        setLiveBidFeed(previousBids => [{
          id: `${updatedListingId}-${Date.now()}`,
          bidderName: data.bidderName || 'Verified Bidder',
          amount: data.currentBid ?? data.newBid ?? 0,
          createdAt: data.createdAt || new Date().toISOString()
        }, ...previousBids])
      }
    })

    connection.on("ReceiveNewBid", (data) => {
      if (token) fetchMyListings();
      if (token) fetchWonAuctions();

      if (data && currentUser && data.previousBidderId === currentUser.userId) {
        const outbidItem = listings.find(item => (item.id || item.Id) === (data.itemId || data.listingId))
        setActiveOutbidAlert({
          listingId: data.itemId || data.listingId,
          listingTitle: outbidItem?.title || 'an auction item',
          newBid: data.newBid ?? data.currentBid ?? data.amount ?? 0
        })
        showToast(`⚠️ You've been outbid! Current bid is now ${data.newBid}`, 'warning');
      } else if (data && currentUser && data.bidderName !== currentUser.fullName) {
        showToast(`🔨 New bid placed on an active auction!`, 'info');
      }
    });

    connection.on("PaymentStatusUpdated", (data) => {
      showToast(`Payment status updated: ${data?.status || 'Unknown'}`, data?.status === 'Failed' ? 'warning' : 'success');
      if (token) {
        fetchWonAuctions();
        fetchMyListings();
      }
    });

    connection.on("CatalogUpdated", () => {
      fetchListings(false);
      if (token) fetchMyListings();
      if (token) fetchWonAuctions();
      if (currentUser?.role === 'Admin') fetchAdminOverview();
    });

    return () => {
      auctionConnectionRef.current = null
      connection.stop();
    }
  }, [token, currentUser, selectedListingId, fetchListings, fetchMyListings, fetchWonAuctions, fetchAdminOverview, showToast])

  useEffect(() => {
    const connection = auctionConnectionRef.current
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) return

    listings.forEach(item => {
      const itemId = item.id || item.Id
      connection.invoke('JoinItemRoom', itemId).catch(err => console.error('Unable to join auction room:', err))
    })
  }, [listings])

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    const endpoint = authMode === 'login' ? 'login' : 'register'
    const body = authMode === 'login' 
      ? { email: authEmail, password: authPassword }
      : { fullName: authFullName, email: authEmail, password: authPassword, phoneNumber: authPhone }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const responseText = await res.text()
      let data = {}
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        const detail = responseText.replace(/\s+/g, ' ').trim().slice(0, 180)
        throw new Error(`Server Error (${res.status})${detail ? `: ${detail}` : ''}`)
      }
      if (!res.ok) throw new Error(data.message || `Authentication failed (${res.status})`)

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

    fetch(`${API_BASE_URL}/api/listings`, {
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

  const addToCart = (item, isInstantBuyPrice = false) => {
    if (!currentUser) return setShowAuthModal(true)

    const itemId = item.id || item.Id
    if (cart.some(cartItem => cartItem.id === itemId)) {
      showToast('This item is already in your cart.', 'warning')
      return
    }

    setCart(previousCart => [...previousCart, {
      id: itemId,
      title: item.title || item.Title,
      price: isInstantBuyPrice
        ? (item.instantBuyPrice ?? item.InstantBuyPrice ?? item.basePrice ?? item.BasePrice)
        : (item.basePrice ?? item.BasePrice),
      currency: item.currency || item.Currency || 'USD',
      sellerName: item.sellerName || item.seller?.fullName || item.Seller?.FullName || 'Verified Seller',
      isWonAuction: false,
      paymentDueDate: null
    }])
    showToast(`Added "${item.title || item.Title}" to your cart.`, 'success')
  }

  const handleBuyNowClick = (item) => {
    if (!currentUser) return setShowAuthModal(true)

    const itemId = item.id || item.Id
    if (cart.some(cartItem => cartItem.id === itemId)) {
      showToast('This item is already in your cart.', 'warning')
      return
    }
    addToCart(item, item.listingType === 'Hybrid')
  }

  const removeFromCart = (itemId) => {
    setCart(previousCart => previousCart.filter(item => item.id !== itemId))
  }

  const addSelectedWonAuctionsToCart = () => {
    if (!selectedWonIds.length) return alert('Select at least one won auction.')

    const selectedItems = wonAuctions.filter(item => selectedWonIds.includes(item.id || item.Id))
    setCart(previousCart => {
      const existingIds = new Set(previousCart.map(item => item.id))
      const newItems = selectedItems
        .filter(item => !existingIds.has(item.id || item.Id))
        .map(item => ({
          id: item.id || item.Id,
          title: item.title || item.Title,
          price: item.currentBid ?? item.CurrentBid ?? item.basePrice ?? item.BasePrice,
          currency: item.currency || item.Currency || 'USD',
          sellerName: item.sellerName || item.seller?.fullName || item.Seller?.FullName || 'Verified Seller',
          isWonAuction: true,
          paymentDueDate: item.paymentDueDate || item.PaymentDueDate || null
        }))
      return [...previousCart, ...newItems]
    })
    setSelectedWonIds([])
    setCurrentView('checkout')
  }

  const handleExecuteBatchCheckout = async () => {
    if (!currentUser) return setShowAuthModal(true)
    if (!cart.length) return showToast('Your cart is empty.', 'warning')

    const itemCountLabel = `${cart.length} item${cart.length === 1 ? '' : 's'}`
    if (!confirm(`Confirm payment for ${itemCountLabel} with ${paymentProvider}?`)) return

    const phoneNumber = getCheckoutPhoneNumber()
    if (!phoneNumber) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/checkout/batch`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          listingIds: cart.map(item => item.id),
          provider: paymentProvider,
          phoneNumber
        })
      })
      const data = await parseJsonSafely(response)
      if (!response.ok) {
        const checkoutError = new Error(data?.message || 'Unable to complete cart checkout')
        checkoutError.staleIds = data?.staleIds || data?.unavailableListingIds || []
        throw checkoutError
      }

      setCart([])
      showToast(data.message || `${cart.length} item(s) paid and released from escrow.`, 'success')
      setCurrentView('catalog')
      fetchListings(false)
      fetchMyListings()
      fetchWonAuctions()
    } catch (err) {
      if (/no longer available|already sold|grace period.*expired|could not be found|auction-only/i.test(err.message)) {
        const staleIds = Array.isArray(err.staleIds)
          ? err.staleIds
          : cart.filter(item => err.message.includes(item.title)).map(item => item.id)
        if (staleIds.length && confirm(`${err.message}\n\nRemove unavailable item(s) from your cart?`)) {
          setCart(previousCart => previousCart.filter(item => !staleIds.includes(item.id)))
          fetchWonAuctions()
          fetchListings(false)
          return
        }
      }
      alert(`Checkout failed: ${err.message}`)
    }
  }

  const handlePlaceBid = (item) => {
    if (!currentUser) return setShowAuthModal(true)
    const targetItemId = item.id || item.Id;
    const enteredBid = parseFloat(bidAmounts[targetItemId]);
    if (!enteredBid || isNaN(enteredBid)) return alert("Please enter a valid bid amount.");

    let normalizedBid = enteredBid;
    if (displayCurrency === 'USD' && item.currency === 'ZiG') normalizedBid = enteredBid * exchangeRate;
    else if (displayCurrency === 'ZiG' && item.currency === 'USD') normalizedBid = enteredBid / exchangeRate;

    if (normalizedBid <= item.currentBid) return alert(`Bid must be higher than current price!`);

    fetch(`${API_BASE_URL}/api/listings/${targetItemId}/bid`, {
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

  const getCheckoutPhoneNumber = () => {
    const phoneToUse = profile?.phoneNumber?.trim() || currentUser?.phoneNumber?.trim()
    if (phoneToUse && ZIMBABWE_PHONE_REGEX.test(phoneToUse)) return phoneToUse

    alert('Please set your mobile money number in Profile Settings before proceeding.')
    setShowProfileModal(true)
    return null
  };

  const handleBatchWonCheckout = async () => {
    const phoneNumber = getCheckoutPhoneNumber()
    if (!phoneNumber) return
    const selectedItems = wonAuctions.filter(item => selectedWonIds.includes(item.id || item.Id));
    if (!selectedItems.length) return alert('Select at least one won auction to check out.');

    try {
      for (const item of selectedItems) {
        const itemId = item.id || item.Id;
        const amount = displayCurrency === item.currency
          ? item.currentBid
          : item.currency === 'USD'
            ? item.currentBid / exchangeRate
            : item.currentBid * exchangeRate;

        const payRes = await fetch(`${API_BASE_URL}/api/checkout`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            listingId: itemId,
            amount: Number(amount.toFixed(2)),
            currency: displayCurrency,
            provider: paymentProvider,
            phoneNumber
          })
        });
        const payData = await parseJsonSafely(payRes);
        if (!payRes.ok) throw new Error(payData?.message || 'Unable to create payment');

        if (!payData.external) {
          const callbackRes = await fetch(`${API_BASE_URL}/api/checkout/${payData.transactionId}/mock-callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true })
          });
          if (!callbackRes.ok) throw new Error('Payment provider callback failed');
        }

        const buyRes = await fetch(`${API_BASE_URL}/api/listings/${itemId}/buy`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        const buyData = await parseJsonSafely(buyRes);
        if (!buyRes.ok) throw new Error(buyData?.message || 'Unable to settle won auction');

        const releaseRes = await fetch(`${API_BASE_URL}/api/checkout/${payData.transactionId}/release`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
        if (!releaseRes.ok) throw new Error('Unable to release escrow');
      }

      setSelectedWonIds([]);
      showToast(`${selectedItems.length} won auction(s) paid and released from escrow.`, 'success');
      fetchWonAuctions();
      fetchMyListings();
      fetchListings(false);
    } catch (err) {
      alert(`Won auction checkout failed: ${err.message}`);
    }
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

  const isInCart = (itemId) => cart.some(cartItem => cartItem.id === itemId)
  const selectedListing = listings.find(item => (item.id || item.Id) === selectedListingId)

  const totalRevenueUSD = myListings.filter(i => i.status === 'Sold').reduce((sum, item) => sum + (item.currentBid || item.basePrice), 0);

  return (
    <div style={{ backgroundColor: colors.bg, padding: '40px 20px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif', color: colors.textMain, minHeight: '100vh', transition: 'background-color 0.3s, color 0.3s' }}>
      {activeOutbidAlert && (
        <div role="alert" aria-live="assertive" style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000, width: 'min(92vw, 680px)', padding: '2px', borderRadius: '16px', background: 'linear-gradient(90deg, #dc2626, #e11d48, #d97706)', boxShadow: '0 20px 40px rgba(69, 10, 10, 0.5)' }}>
          <div style={{ backgroundColor: 'rgba(2, 6, 23, 0.96)', padding: '16px 20px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.6rem' }}>⚠️</span>
              <div>
                <strong style={{ display: 'block', color: '#f87171', fontSize: '0.9rem' }}>You Have Been Outbid!</strong>
                <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>
                  A higher bid of <strong style={{ color: '#fff' }}>{formatValue(activeOutbidAlert.newBid, 'USD')}</strong> was placed on <strong style={{ color: '#34d399' }}>&quot;{activeOutbidAlert.listingTitle}&quot;</strong>.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => {
                setActiveTab('catalog')
                setCurrentView('catalog')
                setTimeout(() => document.getElementById(`listing-${activeOutbidAlert.listingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
                setActiveOutbidAlert(null)
              }} style={{ padding: '8px 12px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.75rem' }}>
                Re-bid Now
              </button>
              <button onClick={() => setActiveOutbidAlert(null)} aria-label="Dismiss outbid alert" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: '4px' }}>✕</button>
            </div>
          </div>
        </div>
      )}
      
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
              <button
                onClick={() => {
                  fetchProfile()
                  setShowProfileModal(true)
                }}
                style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700' }}
              >
                ⚙️ Profile Settings
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              style={{ padding: '8px 16px', borderRadius: '10px', backgroundColor: '#0284c7', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Sign In / Register
            </button>
          )}

          <button
            onClick={() => setCurrentView(currentView === 'cart' ? 'catalog' : 'cart')}
            style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${currentView === 'cart' ? '#10b981' : colors.border}`, backgroundColor: currentView === 'cart' ? '#10b981' : colors.cardBg, color: currentView === 'cart' ? '#052e16' : colors.textMain, cursor: 'pointer', fontWeight: '700' }}
          >
            🛒 Cart {cart.length > 0 && <span style={{ marginLeft: '6px', backgroundColor: currentView === 'cart' ? '#052e16' : '#10b981', color: currentView === 'cart' ? '#d1fae5' : '#052e16', padding: '2px 7px', borderRadius: '999px', fontSize: '0.75rem' }}>{cart.length}</span>}
          </button>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: colors.cardBg, padding: '6px 12px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
            <label style={{ fontWeight: '600', fontSize: '0.85rem', color: colors.textMuted }}>Pay with:</label>
            <select
              value={paymentProvider}
              onChange={(e) => setPaymentProvider(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, fontSize: '0.85rem', fontWeight: 'bold' }}
            >
              <option value="EcoCash">EcoCash</option>
              <option value="InnBucks">InnBucks</option>
              <option value="ZimSwitch">ZimSwitch</option>
            </select>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button 
          onClick={() => {
            setCurrentView('catalog')
            setActiveTab('catalog')
          }}
          style={{ padding: '10px 20px', borderRadius: '10px', border: `1px solid ${activeTab === 'catalog' ? '#0284c7' : colors.border}`, backgroundColor: activeTab === 'catalog' ? '#0284c7' : colors.cardBg, color: activeTab === 'catalog' ? '#ffffff' : colors.textMain, fontWeight: 'bold', cursor: 'pointer' }}
        >
          🌐 Active Catalog ({listings.length})
        </button>
        
        <button 
          onClick={() => {
            if (!currentUser) return setShowAuthModal(true);
            setCurrentView('catalog');
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

        <button
          onClick={() => {
            if (!currentUser) return setShowAuthModal(true);
            setCurrentView('catalog');
            setActiveTab('won');
            fetchWonAuctions();
          }}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: `1px solid ${activeTab === 'won' ? '#d97706' : colors.border}`,
            backgroundColor: activeTab === 'won' ? '#d97706' : colors.cardBg,
            color: activeTab === 'won' ? '#ffffff' : colors.textMain,
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          🏆 Won Auctions ({wonAuctions.length})
        </button>

        {currentUser?.role === 'Admin' && (
          <button 
            onClick={() => {
              setCurrentView('catalog')
              setActiveTab('admin')
              fetchAdminOverview()
            }}
            style={{ padding: '10px 20px', borderRadius: '10px', border: `1px solid ${activeTab === 'admin' ? '#ef4444' : colors.border}`, backgroundColor: activeTab === 'admin' ? '#ef4444' : colors.cardBg, color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🛡️ Admin Command Portal
          </button>
        )}
      </div>

      {currentView === 'listing-detail' ? (
        selectedListing ? (
          <section style={{ maxWidth: '1050px', margin: '0 auto', padding: '10px 0 30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap', borderBottom: `1px solid ${colors.border}`, paddingBottom: '20px', marginBottom: '24px' }}>
              <div>
                <button onClick={() => setCurrentView('catalog')} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: 0, marginBottom: '12px' }}>← Back to Catalog</button>
                <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800' }}>{selectedListing.title}</h1>
                <p style={{ margin: '8px 0 0', color: colors.textMuted, fontSize: '0.9rem' }}>Offered by <strong style={{ color: colors.textMain }}>{selectedListing.sellerName}</strong> · {selectedListing.location || 'Harare'}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, padding: '14px 18px', borderRadius: '14px' }}>
                <span style={{ color: colors.textMuted, fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase' }}>Ends In</span>
                <strong style={{ color: (getTimeRemaining(selectedListing.endTime)?.expired ? '#ef4444' : '#fbbf24'), fontFamily: 'monospace', fontSize: '1.25rem' }}>{getTimeRemaining(selectedListing.endTime)?.text || 'No end time'}</strong>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '22px' }}>
                  <h3 style={{ margin: '0 0 12px', color: colors.textMuted, fontSize: '0.8rem', textTransform: 'uppercase' }}>Item Details</h3>
                  <p style={{ margin: 0, color: colors.textMain, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selectedListing.description || 'No description provided.'}</p>
                </div>
                <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase' }}>🟢 Live Bid Activity ({liveBidFeed.length})</h3>
                    <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>Real-time stream</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
                    {liveBidFeed.map(bid => (
                      <div key={bid.id} style={{ backgroundColor: 'rgba(245, 158, 11, 0.14)', borderLeft: '4px solid #fbbf24', padding: '12px 14px', borderRadius: '0 10px 10px 0', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                        <span><strong style={{ color: '#fcd34d', fontFamily: 'monospace' }}>{formatValue(bid.amount, selectedListing.currency)}</strong> <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>bid placed by <strong style={{ color: colors.textMain }}>@{bid.bidderName}</strong></span></span>
                        <span style={{ color: colors.textMuted, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{formatTimestamp(bid.createdAt)}</span>
                      </div>
                    ))}
                    {!liveBidFeed.length && <p style={{ color: colors.textMuted, textAlign: 'center', padding: '24px 0', margin: 0 }}>No bids placed yet. Be the first to bid!</p>}
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '14px', padding: '22px', alignSelf: 'start', position: 'sticky', top: '20px' }}>
                <div style={{ borderBottom: `1px solid ${colors.border}`, paddingBottom: '18px', marginBottom: '18px' }}>
                  <span style={{ color: colors.textMuted, fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800' }}>Current High Bid</span>
                  <strong style={{ display: 'block', color: '#34d399', fontSize: '2rem', fontFamily: 'monospace', marginTop: '5px' }}>{formatPrice(selectedListing, true)}</strong>
                  <span style={{ color: '#a5b4fc', fontSize: '0.75rem' }}>{formatValue(selectedListing.currentBid * exchangeRate, 'ZiG')}</span>
                </div>
                {selectedListing.listingType !== 'Instant' && !getTimeRemaining(selectedListing.endTime)?.expired && (
                  <form onSubmit={handlePlaceBidOnPage} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ color: colors.textMuted, fontSize: '0.8rem', fontWeight: '700' }}>Your Maximum Bid ({displayCurrency})</label>
                    <input type="number" min="0" step="0.01" required value={pageBidAmount} onChange={event => setPageBidAmount(event.target.value)} placeholder="Enter your bid" style={{ padding: '12px 14px', borderRadius: '9px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, fontFamily: 'monospace', fontWeight: '700' }} />
                    <button type="submit" style={{ padding: '13px', backgroundColor: '#f59e0b', color: '#172554', border: 'none', borderRadius: '9px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' }}>Place Bid</button>
                  </form>
                )}
                {selectedListing.listingType === 'Hybrid' && selectedListing.instantBuyPrice && (
                  <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: '20px', paddingTop: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span style={{ color: colors.textMuted, fontSize: '0.75rem', textTransform: 'uppercase' }}>Instant Buyout</span><strong>{formatValue(selectedListing.instantBuyPrice, selectedListing.currency)}</strong></div>
                    <button type="button" onClick={() => handleBuyNowClick(selectedListing)} style={{ width: '100%', padding: '11px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: '800', cursor: 'pointer' }}>Add Buyout to Cart</button>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div style={{ color: colors.textMuted, textAlign: 'center', padding: '50px' }}>Listing is no longer available.</div>
        )
      ) : currentView === 'cart' ? (
        <section style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}` }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.6rem', fontWeight: '700' }}>🛒 Shopping Cart</h2>
          <p style={{ margin: '0 0 24px 0', color: colors.textMuted }}>Instant purchases and unpaid auction wins are collected here.</p>

          {cart.length === 0 ? (
            <div style={{ color: colors.textMuted, textAlign: 'center', padding: '40px' }}>Your cart is empty.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {cart.map(item => {
                  const dueInfo = item.isWonAuction ? getTimeRemaining(item.paymentDueDate) : null
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', padding: '16px', backgroundColor: colors.inputBg, borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                      <div style={{ flex: 1 }}>
                        <strong>{item.title}</strong>
                        <div style={{ color: colors.textMuted, fontSize: '0.85rem', marginTop: '4px' }}>
                          {item.isWonAuction ? `🏆 Auction win · Due ${dueInfo?.text || 'soon'}` : '⚡ Instant buy'} · {item.sellerName}
                        </div>
                      </div>
                      <strong>{formatValue(item.price, item.currency)}</strong>
                      <button onClick={() => removeFromCart(item.id)} style={{ padding: '7px 10px', backgroundColor: 'transparent', color: '#ef4444', border: `1px solid ${colors.border}`, borderRadius: '8px', cursor: 'pointer' }}>Remove</button>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', borderTop: `1px solid ${colors.border}`, paddingTop: '20px' }}>
                <div>
                  <strong style={{ fontSize: '1.15rem' }}>Total: {formatValue(cart.reduce((sum, item) => sum + (item.currency === displayCurrency ? item.price : item.currency === 'USD' ? item.price * exchangeRate : item.price / exchangeRate), 0), displayCurrency)}</strong>
                  <div style={{ color: colors.textMuted, fontSize: '0.85rem', marginTop: '4px' }}>USD equivalent: {formatValue(cart.reduce((sum, item) => sum + (item.currency === 'USD' ? item.price : item.price / exchangeRate), 0), 'USD')}</div>
                </div>
                <button onClick={() => setCurrentView('checkout')} style={{ padding: '13px 20px', backgroundColor: '#10b981', color: '#052e16', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>
                  Proceed to Checkout →
                </button>
              </div>
            </>
          )}
        </section>
      ) : currentView === 'checkout' ? (
        <section style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}` }}>
          <button onClick={() => setCurrentView('cart')} style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', padding: 0, marginBottom: '20px' }}>← Back to Cart</button>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>1. Delivery & Contact Details</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                  <div><span style={{ display: 'block', color: colors.textMuted, fontSize: '0.75rem' }}>Full Name</span><strong>{profile?.fullName || 'Not set'}</strong></div>
                  <div><span style={{ display: 'block', color: colors.textMuted, fontSize: '0.75rem' }}>City</span><strong>{profile?.city || 'Harare'}</strong></div>
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', color: colors.textMuted, fontSize: '0.75rem' }}>Mobile Money Number</span><strong style={{ color: '#10b981' }}>{profile?.phoneNumber || 'No phone number saved'}</strong></div>
                </div>
                <button onClick={() => { fetchProfile(); setShowProfileModal(true) }} style={{ marginTop: '16px', background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', padding: 0 }}>Edit details in profile</button>
              </div>
              <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>2. Select Payment Provider</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {['EcoCash', 'InnBucks', 'ZimSwitch'].map(provider => (
                    <button key={provider} type="button" onClick={() => setPaymentProvider(provider)} style={{ padding: '10px 8px', borderRadius: '8px', border: `1px solid ${paymentProvider === provider ? '#10b981' : colors.border}`, backgroundColor: paymentProvider === provider ? 'rgba(16, 185, 129, 0.12)' : colors.cardBg, color: paymentProvider === provider ? '#10b981' : colors.textMain, cursor: 'pointer', fontWeight: '700' }}>{provider}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ backgroundColor: colors.inputBg, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}`, alignSelf: 'start' }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Order Summary</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {cart.map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.85rem' }}><span><strong>{item.title}</strong><small style={{ display: 'block', color: colors.textMuted }}>{item.isWonAuction ? 'Auction win' : 'Instant buy'}</small></span><strong>{formatValue(item.price, item.currency)}</strong></div>)}
              </div>
              <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: '18px', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800' }}><span>Total ({displayCurrency})</span><span style={{ color: '#10b981' }}>{formatValue(cart.reduce((sum, item) => sum + (item.currency === displayCurrency ? item.price : item.currency === 'USD' ? item.price * exchangeRate : item.price / exchangeRate), 0), displayCurrency)}</span></div>
                <button onClick={handleExecuteBatchCheckout} style={{ width: '100%', marginTop: '18px', padding: '13px', backgroundColor: '#10b981', color: '#052e16', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>Confirm & Pay with {paymentProvider}</button>
              </div>
            </div>
          </div>
        </section>
      ) : activeTab === 'catalog' ? (
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
              <div className="listing-skeleton-grid">
                {Array.from({ length: 6 }).map((_, index) => <ListingCardSkeleton key={index} />)}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                {filteredListings.map(item => {
                  const itemId = item.id || item.Id;
                  const isBuyoutDisabled = item.listingType === 'Hybrid' && item.currentBid >= (item.instantBuyPrice || item.basePrice);
                  const timerInfo = getTimeRemaining(item.endTime);

                  return (
                    <div id={`listing-${itemId}`} key={itemId} onClick={event => {
                      if (!event.target.closest('button, input, form')) openListingDetail(item)
                    }} className="listing-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '16px', backgroundColor: colors.cardBg, cursor: 'pointer', transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background-color 180ms ease' }}>
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
                            
                            <button onClick={() => openBidHistory(item)} style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start', padding: 0 }}>
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
                          <form onSubmit={(event) => {
                            event.preventDefault();
                            handlePlaceBid(item);
                          }} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            <input 
                              type="number" 
                              step="0.01" 
                              placeholder={`Min Bid: ${formatPrice(item, true)}`}
                              value={bidAmounts[itemId] || ''}
                              onChange={(e) => setBidAmounts(prev => ({ ...prev, [itemId]: e.target.value }))}
                              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain }}
                            />
                              <button type="submit" className="tactile-button" style={{ padding: '10px 16px', backgroundColor: '#0284c7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>
                              Bid
                            </button>
                          </form>
                        )}

                        {(item.listingType === 'Instant' || (item.listingType === 'Hybrid' && !isBuyoutDisabled)) && (
                          <button aria-label={isInCart(itemId) ? `${item.title} is already in cart` : `Buy ${item.title} now`} onClick={() => handleBuyNowClick(item)} disabled={isInCart(itemId)} className="tactile-button" style={{ width: '100%', padding: '12px', backgroundColor: isInCart(itemId) ? colors.inputBg : item.listingType === 'Hybrid' ? '#7c3aed' : '#10b981', color: isInCart(itemId) ? '#34d399' : 'white', border: isInCart(itemId) ? '1px solid rgba(52, 211, 153, 0.35)' : 'none', borderRadius: '10px', fontWeight: '700', cursor: isInCart(itemId) ? 'not-allowed' : 'pointer', opacity: isInCart(itemId) ? 0.9 : 1 }}>
                            {isInCart(itemId) ? '✓ In Cart' : item.listingType === 'Hybrid' ? '⚡ Instant Buyout' : 'Buy Now'}
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
      ) : activeTab === 'won' ? (
        <section style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}` }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.6rem', fontWeight: '700' }}>🏆 Won Auctions</h2>
          <p style={{ margin: '0 0 24px 0', color: colors.textMuted }}>Pay within three days to secure your items. Selected items are processed together.</p>

          {wonAuctions.length === 0 ? (
            <div style={{ color: colors.textMuted, textAlign: 'center', padding: '30px' }}>No won auctions awaiting payment.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                {wonAuctions.map(item => {
                  const itemId = item.id || item.Id;
                  const dueDate = item.paymentDueDate || item.PaymentDueDate;
                  const dueInfo = getTimeRemaining(dueDate);
                  const selected = selectedWonIds.includes(itemId);
                  return (
                    <label key={itemId} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: colors.inputBg, borderRadius: '12px', border: `1px solid ${selected ? '#d97706' : colors.border}`, cursor: 'pointer' }}>
                      <input type="checkbox" checked={selected} onChange={() => setSelectedWonIds(previous => selected ? previous.filter(id => id !== itemId) : [...previous, itemId])} />
                      <span style={{ flex: 1 }}>
                        <strong>{item.title}</strong>
                        <span style={{ display: 'block', color: colors.textMuted, fontSize: '0.85rem' }}>{formatPrice(item, true)} · Due {dueInfo?.text || 'soon'}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <button onClick={addSelectedWonAuctionsToCart} style={{ padding: '12px 18px', backgroundColor: '#10b981', color: '#052e16', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>
                Proceed to Checkout with Selected ({selectedWonIds.length})
              </button>
            </>
          )}
        </section>
      ) : activeTab === 'dashboard' ? (
        /* ISOLATED SELLER DASHBOARD VIEW */
        <section style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', border: `1px solid ${colors.border}` }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.6rem', fontWeight: '700' }}>📊 Personal Seller Dashboard</h2>
          <p style={{ margin: '0 0 30px 0', color: colors.textMuted }}>Isolated metrics for <strong>{currentUser ? currentUser.fullName : 'Seller'}</strong></p>
          {dashboardError && (
            <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.12)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
              Unable to load seller listings: {dashboardError}
            </div>
          )}

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
        <>
          {adminError && (
            <div style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.12)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
              Unable to load admin data: {adminError}
            </div>
          )}
        {adminData && (
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
        }
        </>
      )}

      {/* LIVE TOAST OVERLAY */}
      {toast && (
        <div role="status" aria-live="polite" className="toast-notification" style={{ backgroundColor: toast.type === 'warning' ? '#b91c1c' : toast.type === 'success' ? '#15803d' : '#0284c7', color: '#ffffff', padding: '14px 20px', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 2000, fontWeight: '600', fontSize: '0.95rem' }}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>✕</button>
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
          <div style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '420px', width: '90%', border: `1px solid ${colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: colors.textMain }}>👤 User Profile & Payment Defaults</h3>
              <button onClick={() => setShowProfileModal(false)} style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: '700', color: colors.textMuted }}>Full Name</label>
                <input
                  type="text"
                  required
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                  placeholder="e.g. Tafara Chifamba"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: '700', color: colors.textMuted }}>Mobile Money Number</label>
                <input
                  type="text"
                  required
                  value={profileForm.phoneNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
                  placeholder="e.g. 0771234567"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, boxSizing: 'border-box', fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '4px' }}>Must be valid: 077, 078, 071, or 073</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: '700', color: colors.textMuted }}>City / Location</label>
                  <input
                    type="text"
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: '700', color: colors.textMuted }}>Default Provider</label>
                  <select
                    value={profileForm.preferredPaymentProvider}
                    onChange={(e) => setProfileForm({ ...profileForm, preferredPaymentProvider: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, color: colors.textMain, boxSizing: 'border-box' }}
                  >
                    <option value="EcoCash">EcoCash</option>
                    <option value="InnBucks">InnBucks</option>
                    <option value="ZimSwitch">ZimSwitch</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowProfileModal(false)} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', backgroundColor: colors.inputBg, color: colors.textMain, border: `1px solid ${colors.border}`, cursor: 'pointer', fontWeight: '700' }}>
                  Cancel
                </button>
                <button type="submit" style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', backgroundColor: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
                  Save Details
                </button>
              </div>
            </form>
          </div>
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
          <div style={{ backgroundColor: colors.cardBg, padding: '28px', borderRadius: '16px', maxWidth: '760px', width: '94%', border: `1px solid ${colors.border}` }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.3rem', color: colors.textMain }}>📜 Persistent Bid Log</h3>
            <p style={{ margin: '0 0 20px 0', color: colors.textMuted, fontSize: '0.9rem' }}>Item: <strong>{activeBidHistoryItem.title}</strong></p>
            
            <div style={{ overflowX: 'auto', marginBottom: '20px', maxHeight: '320px', overflowY: 'auto' }}>
              {bidLogs.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.textMuted, textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>Bidder</th>
                      <th style={{ padding: '10px' }}>Amount ({activeBidHistoryItem.currency || 'USD'})</th>
                      <th style={{ padding: '10px' }}>Amount (ZiG)</th>
                      <th style={{ padding: '10px' }}>Time Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bidLogs.map((bid, idx) => {
                      const amount = bid.amount ?? bid.Amount ?? 0
                      const createdAt = bid.createdAt || bid.CreatedAt || bid.bidTime || bid.BidTime
                      return (
                        <tr key={bid.id || bid.Id || idx} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '10px', fontWeight: '600', color: colors.textMain }}>{bid.bidderName || bid.BidderName || 'Verified Bidder'}</td>
                          <td style={{ padding: '10px', color: '#10b981', fontWeight: '600' }}>{formatValue(amount, activeBidHistoryItem.currency || 'USD')}</td>
                          <td style={{ padding: '10px', color: '#a5b4fc' }}>{(activeBidHistoryItem.currency === 'ZiG' ? amount : amount * exchangeRate).toFixed(2)} ZiG</td>
                          <td style={{ padding: '10px', color: colors.textMuted, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{formatTimestamp(createdAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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