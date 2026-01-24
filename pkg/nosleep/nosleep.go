package nosleep

// NoSleeper defines the interface for preventing the system from sleeping.
type NoSleeper interface {
	// Prevent prevents the system from sleeping.
	Prevent() error
	// Allow allows the system to sleep.
	Allow() error
}
