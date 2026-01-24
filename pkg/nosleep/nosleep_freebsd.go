//go:build freebsd
// +build freebsd

package nosleep

type freebsdNoSleeper struct{}

func New() NoSleeper {
	return &freebsdNoSleeper{}
}

func (s *freebsdNoSleeper) Prevent() error {
	// noop on FreeBSD
	return nil
}

func (s *freebsdNoSleeper) Allow() error {
	// noop on FreeBSD
	return nil
}
