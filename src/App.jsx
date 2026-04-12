import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const appTitle = import.meta.env.VITE_APP_TITLE || 'FuelBuddy'
const currency = import.meta.env.VITE_CURRENCY || 'EUR'

const authInitialState = {
  email: '',
  password: '',
}

const FUEL_TYPES = ['Petrol', 'Diesel', 'LPG', 'Electric', 'Hybrid', 'Plug-in Hybrid', 'CNG', 'Hydrogen']

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
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function AppNav({ title, darkMode, onToggleDark, session, onSignOut, busyAction }) {
  return (
    <header className="app-nav">
      <div className="nav-inner">
        <span className="nav-brand">
          <span className="nav-logo" aria-hidden="true">⛽</span>
          {title}
        </span>
        <div className="nav-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onToggleDark}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          {session && (
            <>
              <span className="nav-email" title={session.user.email}>
                {session.user.email}
              </span>
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

      const [{ data: carsData, error: carsError }, { data: refillsData, error: refillsError }] =
        await Promise.all([
          supabase.from('cars').select('*').order('created_at', { ascending: false }),
          supabase.from('refills').select('*').order('filled_at', { ascending: false }),
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

  if (loading) {
    return (
      <>
        <AppNav title={appTitle} darkMode={darkMode} onToggleDark={toggleDark} />
        <main className="app-shell">
          <section className="card hero-card">
            <div className="hero-inner">
              <div className="hero-text">
                <span className="eyebrow">{appTitle}</span>
                <h1>Loading…</h1>
              </div>
            </div>
          </section>
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
      />
      <main className="app-shell">
      <section className="card hero-card">
        <div className="hero-inner">
          <div className="hero-text">
            <span className="eyebrow">{appTitle}</span>
            <h1>Your fuel. Your data.</h1>
            <p className="hero-copy">
              Track refills, monitor economy, and compare cars — all in one place.
            </p>
          </div>
          <div className="hero-stats">
            <article>
              <strong>{cars.length}</strong>
              <span>Cars</span>
            </article>
            <article>
              <strong>{refills.length}</strong>
              <span>Refills</span>
            </article>
            <article>
              <strong>
                {latestKnownEconomy !== null
                  ? `${formatNumber(latestKnownEconomy)}`
                  : '--'}
              </strong>
              <span>L / 100 km</span>
            </article>
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
          <div className="section-heading">
            <div>
              <h2>{authMode === 'signIn' ? 'Sign in' : 'Create account'}</h2>
              <p>Use email and password auth from Supabase.</p>
            </div>
            <div className="toggle-group" role="tablist" aria-label="Authentication mode">
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
                <h2>Your garage</h2>
                <p>Select a car to view its history.</p>
              </div>
              <button
                type="button"
                className="primary-button add-btn"
                onClick={() => setShowAddCar(true)}
              >
                + Add car
              </button>
            </div>

            {cars.length === 0 ? (
              <p className="empty-state">
                Add your first car with the button above, then log refills to track economy.
              </p>
            ) : (
              <div className="car-grid">
                {cars.map((car) => {
                  const metrics = carMetrics[car.id]

                  return (
                    <button
                      type="button"
                      key={car.id}
                      className={selectedCarId === car.id ? 'car-card active' : 'car-card'}
                      onClick={() => setSelectedCarId(car.id)}
                    >
                      <span className="car-name">{car.name}</span>
                      <span className="car-meta">
                        {[car.make, car.model].filter(Boolean).join(' ')}
                        {car.fuel_type ? ` · ${car.fuel_type}` : ''}
                      </span>
                      <span className="car-stat">
                        Avg: {formatNumber(metrics?.averageEconomy)} l/100 km
                      </span>
                      <span className="car-stat">
                        Spent: {formatCurrency(metrics?.totalSpent)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <h2>{selectedCar ? selectedCar.name : 'History'}</h2>
                <p>Full-to-full cycles show calculated fuel economy.</p>
              </div>
              {cars.length > 0 && (
                <button
                  type="button"
                  className="primary-button add-btn"
                  onClick={() => setShowAddRefill(true)}
                >
                  + Add refill
                </button>
              )}
            </div>

            {selectedCar ? (
              <>
                <div className="hero-stats compact">
                  <article>
                    <strong>{formatNumber(selectedCarStats?.averageEconomy)}</strong>
                    <span>Average l/100 km</span>
                  </article>
                  <article>
                    <strong>{formatNumber(selectedCarStats?.lastEconomy)}</strong>
                    <span>Latest l/100 km</span>
                  </article>
                  <article>
                    <strong>{formatCurrency(selectedCarStats?.totalSpent)}</strong>
                    <span>Total fuel spend</span>
                  </article>
                </div>

                {selectedCarHistory.length === 0 ? (
                  <p className="empty-state">No refills saved for this car yet.</p>
                ) : (
                  <div className="history-list">
                    {selectedCarHistory.map((refill) => (
                      <article key={refill.id} className="history-item">
                        <div className="history-topline">
                          <strong>{formatNumber(refill.odometer_km, 1)} km</strong>
                          <span>{formatDate(refill.filled_at)}</span>
                        </div>
                        <div className="history-grid">
                          <span>{formatNumber(refill.fuel_amount_liters)} L</span>
                          <span>Price: {formatCurrency(refill.fuel_price)}</span>
                          <span>Cost: {formatCurrency(refill.totalCost)}</span>
                          <span>{refill.fill_to_top ? 'Full tank' : 'Partial tank'}</span>
                        </div>
                        <div className="economy-badge-row">
                          <span className="economy-badge">
                            {refill.economyLPer100Km !== null
                              ? `${formatNumber(refill.economyLPer100Km)} l/100 km`
                              : 'Economy pending next full refill'}
                          </span>
                          {refill.distanceKm !== null ? (
                            <span className="muted">
                              {formatNumber(refill.distanceKm, 1)} km cycle
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="empty-state">Select a car above to see its refill history.</p>
            )}
          </section>
        </>
      )}
    </main>

    {showAddCar && (
      <Modal title="Add car" onClose={() => setShowAddCar(false)}>
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
            Save car
          </button>
        </form>
      </Modal>
    )}

    {showAddRefill && (
      <Modal title="Add refill" onClose={() => setShowAddRefill(false)}>
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
            <span>I filled the tank to the top</span>
          </label>

          <button
            className="primary-button"
            type="submit"
            disabled={Boolean(busyAction)}
          >
            Save refill
          </button>
        </form>
      </Modal>
    )}
    </>
  )
}

export default App
