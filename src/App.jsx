import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const appTitle = import.meta.env.VITE_APP_TITLE || 'FuelBuddy'
const currency = import.meta.env.VITE_CURRENCY || 'EUR'

const authInitialState = {
  email: '',
  password: '',
}

const FUEL_TYPES = ['Petrol', 'Diesel', 'LPG']

const carInitialState = {
  name: '',
  make: '',
  model: '',
  tankCapacity: '',
  fuelType: '',
}

const getDefaultDateTime = () => {
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return localNow.toISOString().slice(0, 16)
}

const refillInitialState = {
  carId: '',
  odometer: '',
  fuelPrice: '',
  fuelAmount: '',
  fillToTop: true,
  filledAt: getDefaultDateTime(),
}

const formatNumber = (value, fractionDigits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--'
  }

  return Number(value).toFixed(fractionDigits)
}

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--'
  }

  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

const formatDate = (value) => {
  if (!value) {
    return '--'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const calculateRefillSummaries = (refills) => {
  const ordered = [...refills].sort((left, right) => {
    const odometerDifference = Number(left.odometer_km) - Number(right.odometer_km)

    if (odometerDifference !== 0) {
      return odometerDifference
    }

    return new Date(left.filled_at) - new Date(right.filled_at)
  })

  let lastFullOdometer = null
  let litersSinceLastFull = 0

  return ordered.map((refill) => {
    const liters = Number(refill.fuel_amount_liters)
    const price = Number(refill.fuel_price)
    const summary = {
      ...refill,
      totalCost: liters * price,
      cycleFuelLiters: null,
      distanceKm: null,
      economyLPer100Km: null,
    }

    litersSinceLastFull += liters

    if (refill.fill_to_top) {
      if (lastFullOdometer !== null) {
        const distanceKm = Number(refill.odometer_km) - lastFullOdometer

        if (distanceKm > 0) {
          summary.distanceKm = distanceKm
          summary.cycleFuelLiters = litersSinceLastFull
          summary.economyLPer100Km = (litersSinceLastFull / distanceKm) * 100
        }
      }

      lastFullOdometer = Number(refill.odometer_km)
      litersSinceLastFull = 0
    }

    return summary
  })
}

const buildCarMetrics = (cars, refills) =>
  cars.reduce((metrics, car) => {
    const carRefills = refills.filter((refill) => refill.car_id === car.id)
    const summaries = calculateRefillSummaries(carRefills)
    const completedCycles = summaries.filter(
      (summary) => summary.economyLPer100Km !== null && summary.distanceKm !== null,
    )

    const totalCycleFuel = completedCycles.reduce(
      (sum, summary) => sum + Number(summary.cycleFuelLiters),
      0,
    )
    const totalCycleDistance = completedCycles.reduce(
      (sum, summary) => sum + Number(summary.distanceKm),
      0,
    )
    const latestRefill = [...summaries].sort(
      (left, right) => new Date(right.filled_at) - new Date(left.filled_at),
    )[0]

    metrics[car.id] = {
      summaries,
      latestRefill,
      totalSpent: summaries.reduce((sum, summary) => sum + Number(summary.totalCost), 0),
      averageEconomy:
        totalCycleDistance > 0 ? (totalCycleFuel / totalCycleDistance) * 100 : null,
      lastEconomy:
        completedCycles.length > 0
          ? completedCycles[completedCycles.length - 1].economyLPer100Km
          : null,
    }

    return metrics
  }, {})

const getInitialDarkMode = () => {
  try {
    const stored = localStorage.getItem('fuelbuddy-dark')
    if (stored !== null) return stored === 'true'
  } catch { /* ignore */ }
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

const GAUGE_MAX = 15
const GAUGE_SEGMENTS = 20

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)

const IconDelete = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
  </svg>
)

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const IconSun = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
)

function getSegmentColor(index) {
  if (index <= 6)  return '#00c870'
  if (index <= 10) return '#f0a820'
  if (index <= 14) return '#e05010'
  return '#d43030'
}

function EconomyGauge({ value, size = 'md', showLabel = true }) {
  const filled = value !== null
    ? Math.min(Math.max(0, Math.round((value / GAUGE_MAX) * GAUGE_SEGMENTS)), GAUGE_SEGMENTS)
    : 0

  return (
    <div
      className={`economy-gauge economy-gauge--${size}`}
      role="img"
      aria-label={value !== null ? `${value.toFixed(1)} L/100km` : 'No consumption data'}
    >
      <div className="gauge-segments">
        {Array.from({ length: GAUGE_SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`gauge-seg${i < filled ? ' gauge-seg--filled' : ''}`}
            style={i < filled ? {
              backgroundColor: getSegmentColor(i),
              animationDelay: `${i * 30}ms`,
            } : undefined}
          />
        ))}
      </div>
      {showLabel && value !== null && (
        <span className="gauge-label">
          {value.toFixed(1)}<span className="gauge-unit"> L/100km</span>
        </span>
      )}
    </div>
  )
}

function TumblingNumber({ value }) {
  const chars = String(value).split('')
  return (
    <span className="tumbling-number" aria-label={value}>
      {chars.map((char, i) => (
        <span
          key={`${value}-${i}`}
          className={`tumbling-char${char === '.' || char === ',' ? ' tumbling-char--punct' : ''}`}
          style={{ animationDelay: `${i * 45}ms` }}
          aria-hidden="true"
        >
          {char}
        </span>
      ))}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ConfirmDialog({ message, detail, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel} role="alertdialog" aria-modal="true">
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">⚠</div>
        <h2 className="confirm-title">{message}</h2>
        {detail && <p className="confirm-detail">{detail}</p>}
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="danger-button" onClick={onConfirm}>{confirmLabel}</button>
        </div>      </div>
    </div>
  )
}

function AppNav({ title, darkMode, onToggleDark, session, onSignOut, busyAction, onOpenProfile }) {
  const initials = session
    ? (session.user.email ?? 'U').slice(0, 2).toUpperCase()
    : null

  return (
    <header className="app-nav">
      <div className="nav-inner">
        <span className="nav-brand">
          <svg className="nav-gauge-icon" width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
            <path d="M7 0C7 0 1 8.2 1 11.5C1 14.04 3.686 16 7 16C10.314 16 13 14.04 13 11.5C13 8.2 7 0 7 0Z"/>
          </svg>
          {title.toUpperCase()}
        </span>
        <div className="nav-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onToggleDark}
            aria-label={darkMode ? 'Switch to day mode' : 'Switch to night mode'}
            title={darkMode ? 'Day mode' : 'Night mode'}
          >
            {darkMode ? <IconSun /> : <IconMoon />}
          </button>
          {session && (
            <>
              <span className="nav-email" title={session.user.email}>
                {session.user.email}
              </span>
              <button
                type="button"
                className="icon-button icon-button--wide"
                onClick={onOpenProfile}
                aria-label="Profile settings"
                title="Profile settings"
              >
                {initials}
              </button>
              <button
                type="button"
                className="secondary-button nav-signout"
                onClick={onSignOut}
                disabled={Boolean(busyAction)}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [authMode, setAuthMode] = useState('signIn')
  const [authForm, setAuthForm] = useState(authInitialState)
  const [carForm, setCarForm] = useState(carInitialState)
  const [refillForm, setRefillForm] = useState(refillInitialState)
  const [cars, setCars] = useState([])
  const [refills, setRefills] = useState([])
  const [selectedCarId, setSelectedCarId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [notice, setNotice] = useState(null)
  const [darkMode, setDarkMode] = useState(getInitialDarkMode)
  const [showAddCar, setShowAddCar] = useState(false)
  const [showAddRefill, setShowAddRefill] = useState(false)
  const [editCar, setEditCar] = useState(null)
  const [editRefill, setEditRefill] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileForm, setProfileForm] = useState({ displayName: '', newPassword: '' })
  const [confirmDialog, setConfirmDialog] = useState(null)

  const toggleDark = () =>
    setDarkMode((prev) => {
      const next = !prev
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
      try {
        localStorage.setItem('fuelbuddy-dark', String(next))
      } catch { /* ignore */ }
      return next
    })

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined
    }

    let mounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (error) {
        setNotice({ type: 'error', text: error.message })
        setLoading(false)
        return
      }

      setSession(data.session)
      setLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || !supabase) {
      return
    }

    const loadData = async () => {
      setBusyAction('Loading your garage...')

      const [
        { data: carsData, error: carsError },
        { data: refillsData, error: refillsError },
        { data: profileData },
      ] = await Promise.all([
        supabase.from('cars').select('*').order('created_at', { ascending: false }),
        supabase.from('refills').select('*').order('filled_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      ])

      if (carsError) {
        setNotice({ type: 'error', text: carsError.message })
        setBusyAction('')
        return
      }

      if (refillsError) {
        setNotice({ type: 'error', text: refillsError.message })
        setBusyAction('')
        return
      }

      setCars(carsData)
      setRefills(refillsData)
      if (profileData) {
        setProfile(profileData)
        setProfileForm((f) => ({ ...f, displayName: profileData.display_name ?? '' }))
      }
      setSelectedCarId((currentValue) => {
        if (currentValue && carsData.some((car) => car.id === currentValue)) {
          return currentValue
        }

        return carsData[0]?.id ?? ''
      })
      setBusyAction('')
    }

    loadData()
  }, [session])

  const carMetrics = useMemo(() => buildCarMetrics(cars, refills), [cars, refills])
  const totalSpend = useMemo(
    () => Object.values(carMetrics).reduce((sum, m) => sum + m.totalSpent, 0),
    [carMetrics],
  )
  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null
  const selectedCarStats = selectedCar ? carMetrics[selectedCar.id] : null
  const selectedCarHistory = selectedCarStats
    ? [...selectedCarStats.summaries].sort(
        (left, right) => new Date(right.filled_at) - new Date(left.filled_at),
      )
    : []

  const latestKnownEconomy =
    selectedCarStats?.lastEconomy ??
    Object.values(carMetrics).find((metric) => metric.lastEconomy !== null)?.lastEconomy ??
    null

  const heroEconomy =
    selectedCarStats?.averageEconomy ??
    Object.values(carMetrics).find((m) => m.averageEconomy !== null)?.averageEconomy ??
    null

  const handleAuthSubmit = async (event) => {
    event.preventDefault()

    if (!supabase) {
      return
    }

    setBusyAction(authMode === 'signIn' ? 'Signing in...' : 'Creating account...')
    setNotice(null)

    const credentials = {
      email: authForm.email.trim(),
      password: authForm.password,
    }

    const { error } =
      authMode === 'signIn'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials)

    if (error) {
      setNotice({ type: 'error', text: error.message })
      setBusyAction('')
      return
    }

    setAuthForm(authInitialState)
    setNotice({
      type: 'success',
      text:
        authMode === 'signIn'
          ? 'Signed in successfully.'
          : 'Account created. If email confirmation is enabled, check your inbox.',
    })
    setBusyAction('')
  }

  const handleSignOut = async () => {
    if (!supabase) {
      return
    }

    setBusyAction('Signing out...')
    setNotice(null)

    const { error } = await supabase.auth.signOut()

    if (error) {
      setNotice({ type: 'error', text: error.message })
      setBusyAction('')
      return
    }

    setCars([])
    setRefills([])
    setSelectedCarId('')
    setBusyAction('')
  }

  const handleAddCar = async (event) => {
    event.preventDefault()

    if (!session || !supabase) {
      return
    }

    setBusyAction('Saving car...')
    setNotice(null)

    const carPayload = {
      user_id: session.user.id,
      name: carForm.name.trim(),
      make: carForm.make.trim() || null,
      model: carForm.model.trim() || null,
      tank_capacity_liters: carForm.tankCapacity ? Number(carForm.tankCapacity) : null,
      fuel_type: carForm.fuelType || null,
    }

    const { data, error } = await supabase
      .from('cars')
      .insert(carPayload)
      .select('*')
      .single()

    if (error) {
      setNotice({ type: 'error', text: error.message })
      setBusyAction('')
      return
    }

    setCars((currentValue) => [data, ...currentValue])
    setSelectedCarId(data.id)
    setCarForm(carInitialState)
    setNotice({ type: 'success', text: `${data.name} added to your garage.` })
    setShowAddCar(false)
    setBusyAction('')
  }

  const handleAddRefill = async (event) => {
    event.preventDefault()

    if (!session || !supabase) {
      return
    }

    const carId = refillForm.carId || selectedCarId

    if (!carId) {
      setNotice({ type: 'error', text: 'Add a car before saving refills.' })
      return
    }

    const latestCarOdometer = refills
      .filter((refill) => refill.car_id === carId)
      .reduce((highestOdometer, refill) => {
        const currentOdometer = Number(refill.odometer_km)
        return currentOdometer > highestOdometer ? currentOdometer : highestOdometer
      }, 0)

    if (
      latestCarOdometer > 0 &&
      Number(refillForm.odometer) <= Number(latestCarOdometer)
    ) {
      setNotice({
        type: 'error',
        text: `Odometer must be greater than the latest saved value (${formatNumber(latestCarOdometer, 1)} km).`,
      })
      return
    }

    setBusyAction('Saving refill...')
    setNotice(null)

    const refillPayload = {
      user_id: session.user.id,
      car_id: carId,
      odometer_km: Number(refillForm.odometer),
      fuel_price: Number(refillForm.fuelPrice),
      fuel_amount_liters: Number(refillForm.fuelAmount),
      fill_to_top: refillForm.fillToTop,
      filled_at: new Date(refillForm.filledAt).toISOString(),
    }

    const { data, error } = await supabase
      .from('refills')
      .insert(refillPayload)
      .select('*')
      .single()

    if (error) {
      setNotice({ type: 'error', text: error.message })
      setBusyAction('')
      return
    }

    setRefills((currentValue) => [data, ...currentValue])
    setSelectedCarId(carId)
    setRefillForm({
      ...refillInitialState,
      carId,
      filledAt: getDefaultDateTime(),
    })
    setNotice({ type: 'success', text: 'Refill saved.' })
    setShowAddRefill(false)
    setBusyAction('')
  }

  const handleUpdateCar = async (event) => {
    event.preventDefault()
    if (!session || !supabase || !editCar) return

    setBusyAction('Saving changes...')
    setNotice(null)

    const { data, error } = await supabase
      .from('cars')
      .update({
        name: carForm.name.trim(),
        make: carForm.make.trim() || null,
        model: carForm.model.trim() || null,
        tank_capacity_liters: carForm.tankCapacity ? Number(carForm.tankCapacity) : null,
        fuel_type: carForm.fuelType || null,
      })
      .eq('id', editCar.id)
      .select('*')
      .single()

    if (error) {
      setNotice({ type: 'error', text: error.message })
      setBusyAction('')
      return
    }

    setCars((current) => current.map((c) => (c.id === data.id ? data : c)))
    setEditCar(null)
    setCarForm(carInitialState)
    setNotice({ type: 'success', text: `${data.name} updated.` })
    setBusyAction('')
  }

  const handleDeleteCar = async (car) => {
    setConfirmDialog({
      message: `Delete "${car.name}"?`,
      detail: 'This will permanently delete the car and all its refill history.',
      confirmLabel: 'Yes, delete',
      onConfirm: async () => {
        setConfirmDialog(null)
        if (!session || !supabase) return
        setBusyAction('Deleting car...')
        setNotice(null)
        await supabase.from('refills').delete().eq('car_id', car.id)
        const { error } = await supabase.from('cars').delete().eq('id', car.id)
        if (error) { setNotice({ type: 'error', text: error.message }); setBusyAction(''); return }
        setCars((current) => current.filter((c) => c.id !== car.id))
        setRefills((current) => current.filter((r) => r.car_id !== car.id))
        setSelectedCarId((current) => (current === car.id ? '' : current))
        setNotice({ type: 'success', text: `${car.name} deleted.` })
        setBusyAction('')
      },
    })
  }

  const handleUpdateRefill = async (event) => {
    event.preventDefault()
    if (!session || !supabase || !editRefill) return

    setBusyAction('Saving changes...')
    setNotice(null)

    const { data, error } = await supabase
      .from('refills')
      .update({
        odometer_km: Number(refillForm.odometer),
        fuel_price: Number(refillForm.fuelPrice),
        fuel_amount_liters: Number(refillForm.fuelAmount),
        fill_to_top: refillForm.fillToTop,
        filled_at: new Date(refillForm.filledAt).toISOString(),
      })
      .eq('id', editRefill.id)
      .select('*')
      .single()

    if (error) {
      setNotice({ type: 'error', text: error.message })
      setBusyAction('')
      return
    }

    setRefills((current) => current.map((r) => (r.id === data.id ? data : r)))
    setEditRefill(null)
    setRefillForm({ ...refillInitialState, filledAt: getDefaultDateTime() })
    setNotice({ type: 'success', text: 'Refill updated.' })
    setBusyAction('')
  }

  const handleDeleteRefill = async (refill) => {
    setConfirmDialog({
      message: 'Delete this refill?',
      detail: `${formatNumber(refill.odometer_km, 1)} km · ${formatNumber(refill.fuel_amount_liters)} L · ${formatDate(refill.filled_at)}`,
      confirmLabel: 'Yes, delete',
      onConfirm: async () => {
        setConfirmDialog(null)
        if (!session || !supabase) return
        setBusyAction('Deleting refill...')
        setNotice(null)
        const { error } = await supabase.from('refills').delete().eq('id', refill.id)
        if (error) { setNotice({ type: 'error', text: error.message }); setBusyAction(''); return }
        setRefills((current) => current.filter((r) => r.id !== refill.id))
        setNotice({ type: 'success', text: 'Refill deleted.' })
        setBusyAction('')
      },
    })
  }

  const handleSaveProfile = async (event) => {
    event.preventDefault()
    if (!session || !supabase) return

    setBusyAction('Saving profile...')
    setNotice(null)

    const updates = []

    updates.push(
      supabase.from('profiles').upsert({
        id: session.user.id,
        display_name: profileForm.displayName.trim() || null,
      })
    )

    if (profileForm.newPassword) {
      updates.push(supabase.auth.updateUser({ password: profileForm.newPassword }))
    }

    const results = await Promise.all(updates)
    const firstError = results.find((r) => r.error)?.error

    if (firstError) {
      setNotice({ type: 'error', text: firstError.message })
      setBusyAction('')
      return
    }

    setProfile((p) => ({ ...p, display_name: profileForm.displayName.trim() || null }))
    setProfileForm((f) => ({ ...f, newPassword: '' }))
    setNotice({ type: 'success', text: 'Profile saved.' })
    setShowProfile(false)
    setBusyAction('')
  }

  if (loading) {
    return (
      <>
        <AppNav title={appTitle} darkMode={darkMode} onToggleDark={toggleDark} />
        <main className="app-shell">
          <div className="loading-cluster">
            <span className="loading-label">Loading garage…</span>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <AppNav
        title={appTitle}
        darkMode={darkMode}
        onToggleDark={toggleDark}
        session={session}
        onSignOut={handleSignOut}
        busyAction={busyAction}
        onOpenProfile={() => setShowProfile(true)}
      />
      <main className="app-shell">
      <section className="primary-cluster">
        <div className="primary-readout">
          <span className="primary-readout-label">Average consumption</span>
          <div className="primary-value-row">
            <span className={`primary-value tabular-nums${heroEconomy === null ? ' primary-value--dim' : ''}`}>
              {heroEconomy !== null
                ? <TumblingNumber key={formatNumber(heroEconomy, 1)} value={formatNumber(heroEconomy, 1)} />
                : '--'
              }
            </span>
            <span className="primary-unit">L/100km</span>
          </div>
          {heroEconomy !== null && (
            <EconomyGauge value={heroEconomy} size="lg" showLabel={false} />
          )}
        </div>
        <div className="stat-pods">
          <div className="stat-pod">
            <span className="stat-value tabular-nums">{cars.length}</span>
            <span className="stat-label">Vehicles</span>
          </div>
          <div className="stat-pod">
            <span className="stat-value tabular-nums">{refills.length}</span>
            <span className="stat-label">Fills</span>
          </div>
          <div className="stat-pod">
            <span className="stat-value tabular-nums">
              {formatCurrency(totalSpend)}
            </span>
            <span className="stat-label">Spent</span>
          </div>
        </div>
      </section>

      {notice ? (
        <section
          className={notice.type === 'error' ? 'notice error' : 'notice success'}
          aria-live="polite"
        >
          {notice.text}
        </section>
      ) : null}

      {busyAction ? (
        <section className="notice neutral" aria-live="polite">
          {busyAction}
        </section>
      ) : null}

      {!isSupabaseConfigured ? (
        <section className="card setup-card">
          <h2>Connect Supabase first</h2>
          <p>
            Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in a local <code>.env</code>{' '}
            file,
            then run the SQL from <code>supabase/schema.sql</code>.
          </p>
          <p className="muted">
            The app UI is ready, but login and saved data need those values before
            the forms can talk to your database.
          </p>
        </section>
      ) : !session ? (
        <section className="card auth-card">
          <div className="auth-header">
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={authMode === 'signIn' ? 'toggle active' : 'toggle'}
                onClick={() => setAuthMode('signIn')}
              >
                Sign in
              </button>
              <button
                type="button"
                className={authMode === 'signUp' ? 'toggle active' : 'toggle'}
                onClick={() => setAuthMode('signUp')}
              >
                Register
              </button>
            </div>
            <div>
              <h2>{authMode === 'signIn' ? 'Sign in' : 'Create account'}</h2>
              <p>Access your garage with email and password.</p>
            </div>
          </div>

          <form className="stack" onSubmit={handleAuthSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }))
                }
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((currentValue) => ({
                    ...currentValue,
                    password: event.target.value,
                  }))
                }
                placeholder="Minimum 6 characters"
                minLength="6"
                required
              />
            </label>

            <button className="primary-button" type="submit" disabled={Boolean(busyAction)}>
              {authMode === 'signIn' ? 'Continue' : 'Create account'}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Garage</h2>
                <p>Select a vehicle to view its history.</p>
              </div>
              <button
                type="button"
                className="primary-button add-btn"
                onClick={() => setShowAddCar(true)}
              >
                + Register vehicle
              </button>
            </div>

            {cars.length === 0 ? (
              <p className="empty-state">
                No vehicles registered. Register your first vehicle to begin tracking.
              </p>
            ) : (
              <div className="car-grid">
                {cars.map((car) => {
                  const metrics = carMetrics[car.id]

                  return (
                    <div
                      key={car.id}
                      className={selectedCarId === car.id ? 'car-card active' : 'car-card'}
                      onClick={() => setSelectedCarId(car.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedCarId(car.id)}
                    >
                      <div className="car-card-top">
                        <span className="car-name">{car.name}</span>
                        <div className="car-card-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="card-action-btn"
                            title="Modify vehicle"
                            onClick={() => {
                              setCarForm({
                                name: car.name,
                                make: car.make ?? '',
                                model: car.model ?? '',
                                tankCapacity: car.tank_capacity_liters ?? '',
                                fuelType: car.fuel_type ?? '',
                              })
                              setEditCar(car)
                            }}
                          ><IconEdit /></button>
                          <button
                            type="button"
                            className="card-action-btn card-action-btn--danger"
                            title="Remove vehicle"
                            onClick={() => handleDeleteCar(car)}
                          ><IconDelete /></button>
                        </div>
                      </div>
                      <span className="car-meta">
                        {[car.make, car.model].filter(Boolean).join(' ')}
                        {car.fuel_type ? ` · ${car.fuel_type}` : ''}
                      </span>
                      {car.tank_capacity_liters && metrics?.latestRefill ? (
                        <div className="tank-bar" title={`Est. tank level`}>
                          <div
                            className="tank-fill"
                            style={{
                              width: `${Math.min(100, (Number(metrics.latestRefill.fuel_amount_liters) / car.tank_capacity_liters) * 100)}%`,
                            }}
                          />
                        </div>
                      ) : null}
                      {metrics?.averageEconomy !== null && metrics?.averageEconomy !== undefined ? (
                        <EconomyGauge value={metrics.averageEconomy} size="sm" showLabel={true} />
                      ) : (
                        <span className="car-stat">No fills logged</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <h2>{selectedCar ? selectedCar.name : 'History'}</h2>
                <p>Full-to-full cycles show calculated consumption.</p>
              </div>
              {cars.length > 0 && (
                <button
                  type="button"
                  className="primary-button add-btn"
                  onClick={() => setShowAddRefill(true)}
                >
                  + Log fill
                </button>
              )}
            </div>

            {selectedCar ? (
              <>
                <div className="car-stats-row">
                  <div className="car-stat-pod">
                    <span className="car-stat-value tabular-nums">
                      {formatNumber(selectedCarStats?.averageEconomy, 1)}
                    </span>
                    <span className="car-stat-label">Avg L/100km</span>
                  </div>
                  <div className="car-stat-pod">
                    <span className="car-stat-value tabular-nums">
                      {formatNumber(selectedCarStats?.lastEconomy, 1)}
                    </span>
                    <span className="car-stat-label">Last cycle</span>
                  </div>
                  <div className="car-stat-pod">
                    <span className="car-stat-value tabular-nums">
                      {formatCurrency(selectedCarStats?.totalSpent)}
                    </span>
                    <span className="car-stat-label">Total spend</span>
                  </div>
                </div>

                {selectedCarHistory.length === 0 ? (
                  <p className="empty-state">No fills logged for this vehicle.</p>
                ) : (
                  <div className="history-list">
                    {selectedCarHistory.map((refill) => (
                      <article key={refill.id} className="history-item">
                        <div className="history-topline">
                          <span className="history-odometer tabular-nums">
                            {formatNumber(refill.odometer_km, 1)} km
                          </span>
                          <div className="history-topline-right">
                            <span className="history-date">{formatDate(refill.filled_at)}</span>
                            <button
                              type="button"
                              className="card-action-btn"
                              title="Modify fill"
                              onClick={() => {
                                const d = new Date(refill.filled_at)
                                const local = new Date(d - d.getTimezoneOffset() * 60000)
                                  .toISOString().slice(0, 16)
                                setRefillForm({
                                  carId: refill.car_id,
                                  odometer: refill.odometer_km,
                                  fuelPrice: refill.fuel_price,
                                  fuelAmount: refill.fuel_amount_liters,
                                  fillToTop: refill.fill_to_top,
                                  filledAt: local,
                                })
                                setEditRefill(refill)
                              }}
                            ><IconEdit /></button>
                            <button
                              type="button"
                              className="card-action-btn card-action-btn--danger"
                              title="Remove fill"
                              onClick={() => handleDeleteRefill(refill)}
                            ><IconDelete /></button>
                          </div>
                        </div>
                        <div className="history-grid">
                          <div className="history-data-cell">
                            <span className="history-cell-label">Amount</span>
                            {formatNumber(refill.fuel_amount_liters)} L
                          </div>
                          <div className="history-data-cell">
                            <span className="history-cell-label">Price/L</span>
                            {formatCurrency(refill.fuel_price)}
                          </div>
                          <div className="history-data-cell">
                            <span className="history-cell-label">Total</span>
                            {formatCurrency(refill.totalCost)}
                          </div>
                          <div className="history-data-cell">
                            <span className="history-cell-label">Type</span>
                            <span className={`fill-badge ${refill.fill_to_top ? 'fill-badge--full' : 'fill-badge--partial'}`}>
                              {refill.fill_to_top ? 'FULL' : 'PARTIAL'}
                            </span>
                          </div>
                        </div>
                        <div className="history-economy-row">
                          {refill.economyLPer100Km !== null ? (
                            <EconomyGauge value={refill.economyLPer100Km} size="md" showLabel={true} />
                          ) : (
                            <span className="economy-badge economy-badge--pending">
                              Pending next full fill
                            </span>
                          )}
                          {refill.distanceKm !== null && (
                            <span className="history-date tabular-nums">
                              {formatNumber(refill.distanceKm, 1)} km cycle
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="empty-state">Select a vehicle above to see its fill history.</p>
            )}
          </section>
        </>
      )}
    </main>

    {showAddCar && (
      <Modal title="Register vehicle" onClose={() => setShowAddCar(false)}>
        <form className="stack" onSubmit={handleAddCar}>
          <label className="field">
            <span>Car name</span>
            <input
              type="text"
              value={carForm.name}
              onChange={(event) =>
                setCarForm((currentValue) => ({ ...currentValue, name: event.target.value }))
              }
              placeholder="Family hatchback"
              required
              autoFocus
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Make</span>
              <input
                type="text"
                value={carForm.make}
                onChange={(event) =>
                  setCarForm((currentValue) => ({ ...currentValue, make: event.target.value }))
                }
                placeholder="Volkswagen"
              />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                type="text"
                value={carForm.model}
                onChange={(event) =>
                  setCarForm((currentValue) => ({ ...currentValue, model: event.target.value }))
                }
                placeholder="Golf"
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Tank capacity (liters)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={carForm.tankCapacity}
                onChange={(event) =>
                  setCarForm((currentValue) => ({
                    ...currentValue,
                    tankCapacity: event.target.value,
                  }))
                }
                placeholder="55"
              />
            </label>
            <label className="field">
              <span>Fuel type</span>
              <select
                value={carForm.fuelType}
                onChange={(event) =>
                  setCarForm((currentValue) => ({ ...currentValue, fuelType: event.target.value }))
                }
              >
                <option value="">Select…</option>
                {FUEL_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{ft}</option>
                ))}
              </select>
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={Boolean(busyAction)}>
            Register vehicle
          </button>
        </form>
      </Modal>
    )}

    {showAddRefill && (
      <Modal title="Log fill" onClose={() => setShowAddRefill(false)}>
        <form className="stack" onSubmit={handleAddRefill}>
          <label className="field">
            <span>Car</span>
            <select
              value={refillForm.carId || selectedCarId || ''}
              onChange={(event) =>
                setRefillForm((currentValue) => ({ ...currentValue, carId: event.target.value }))
              }
              required
            >
              <option value="" disabled>Select a car</option>
              {cars.map((car) => (
                <option key={car.id} value={car.id}>{car.name}</option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Odometer (km)</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={refillForm.odometer}
                onChange={(event) =>
                  setRefillForm((currentValue) => ({
                    ...currentValue,
                    odometer: event.target.value,
                  }))
                }
                placeholder="120540"
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Fuel price (per L)</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={refillForm.fuelPrice}
                onChange={(event) =>
                  setRefillForm((currentValue) => ({
                    ...currentValue,
                    fuelPrice: event.target.value,
                  }))
                }
                placeholder="2.59"
                required
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Fuel amount (liters)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={refillForm.fuelAmount}
                onChange={(event) =>
                  setRefillForm((currentValue) => ({
                    ...currentValue,
                    fuelAmount: event.target.value,
                  }))
                }
                placeholder="42.50"
                required
              />
            </label>
            <label className="field">
              <span>Filled at</span>
              <input
                type="datetime-local"
                value={refillForm.filledAt}
                onChange={(event) =>
                  setRefillForm((currentValue) => ({
                    ...currentValue,
                    filledAt: event.target.value,
                  }))
                }
                required
              />
            </label>
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={refillForm.fillToTop}
              onChange={(event) =>
                setRefillForm((currentValue) => ({
                  ...currentValue,
                  fillToTop: event.target.checked,
                }))
              }
            />
            <span>Filled to top (full fill)</span>
          </label>

          <button
            className="primary-button"
            type="submit"
            disabled={Boolean(busyAction)}
          >
            Log fill
          </button>
        </form>
      </Modal>
    )}

    {editCar && (
      <Modal title={`Edit — ${editCar.name}`} onClose={() => { setEditCar(null); setCarForm(carInitialState) }}>
        <form className="stack" onSubmit={handleUpdateCar}>
          <label className="field">
            <span>Car name</span>
            <input type="text" value={carForm.name}
              onChange={(e) => setCarForm((f) => ({ ...f, name: e.target.value }))}
              required autoFocus />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Make</span>
              <input type="text" value={carForm.make} placeholder="Volkswagen"
                onChange={(e) => setCarForm((f) => ({ ...f, make: e.target.value }))} />
            </label>
            <label className="field">
              <span>Model</span>
              <input type="text" value={carForm.model} placeholder="Golf"
                onChange={(e) => setCarForm((f) => ({ ...f, model: e.target.value }))} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Tank capacity (L)</span>
              <input type="number" min="0" step="0.1" value={carForm.tankCapacity} placeholder="55"
                onChange={(e) => setCarForm((f) => ({ ...f, tankCapacity: e.target.value }))} />
            </label>
            <label className="field">
              <span>Fuel type</span>
              <select value={carForm.fuelType}
                onChange={(e) => setCarForm((f) => ({ ...f, fuelType: e.target.value }))}>
                <option value="">Select…</option>
                {FUEL_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
              </select>
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={Boolean(busyAction)}>
            Save changes
          </button>
        </form>
      </Modal>
    )}

    {editRefill && (
      <Modal title="Edit refill" onClose={() => { setEditRefill(null); setRefillForm({ ...refillInitialState, filledAt: getDefaultDateTime() }) }}>
        <form className="stack" onSubmit={handleUpdateRefill}>
          <div className="field-row">
            <label className="field">
              <span>Odometer (km)</span>
              <input type="number" min="0" step="0.1" value={refillForm.odometer} required autoFocus
                onChange={(e) => setRefillForm((f) => ({ ...f, odometer: e.target.value }))} />
            </label>
            <label className="field">
              <span>Fuel price (per L)</span>
              <input type="number" min="0" step="0.001" value={refillForm.fuelPrice} required
                onChange={(e) => setRefillForm((f) => ({ ...f, fuelPrice: e.target.value }))} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Fuel amount (L)</span>
              <input type="number" min="0" step="0.01" value={refillForm.fuelAmount} required
                onChange={(e) => setRefillForm((f) => ({ ...f, fuelAmount: e.target.value }))} />
            </label>
            <label className="field">
              <span>Date & time</span>
              <input type="datetime-local" value={refillForm.filledAt} required
                onChange={(e) => setRefillForm((f) => ({ ...f, filledAt: e.target.value }))} />
            </label>
          </div>
          <label className="checkbox-field">
            <input type="checkbox" checked={refillForm.fillToTop}
              onChange={(e) => setRefillForm((f) => ({ ...f, fillToTop: e.target.checked }))} />
            <span>Filled to top (full fill)</span>
          </label>
          <button className="primary-button" type="submit" disabled={Boolean(busyAction)}>
            Save changes
          </button>
        </form>
      </Modal>
    )}

    {showProfile && (
      <Modal title="Profile" onClose={() => setShowProfile(false)}>
        <form className="stack" onSubmit={handleSaveProfile}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={session?.user?.email ?? ''} disabled />
          </label>
          <label className="field">
            <span>Display name</span>
            <input type="text" value={profileForm.displayName} placeholder="Your name"
              onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} />
          </label>
          <label className="field">
            <span>New password <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(leave blank to keep current)</span></span>
            <input type="password" value={profileForm.newPassword} placeholder="Min. 6 characters"
              minLength={profileForm.newPassword ? 6 : undefined}
              onChange={(e) => setProfileForm((f) => ({ ...f, newPassword: e.target.value }))} />
          </label>
          <button className="primary-button" type="submit" disabled={Boolean(busyAction)}>
            Save profile
          </button>
        </form>
      </Modal>
    )}

    {confirmDialog && (
      <ConfirmDialog
        message={confirmDialog.message}
        detail={confirmDialog.detail}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(null)}
      />
    )}
    </>
  )
}

export default App
