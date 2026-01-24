//go:build linux
// +build linux

package nosleep

import (
	"os"

	"github.com/coreos/go-systemd/v22/dbus"
)

type linuxNoSleeper struct {
	conn   *dbus.Conn
	lockFd *os.File
}

func New() NoSleeper {
	conn, err := dbus.New()
	if err != nil {
		return nil
	}
	return &linuxNoSleeper{conn: conn}
}

func (s *linuxNoSleeper) Prevent() error {
	var err error
	s.lockFd, err = s.conn.Inhibit("sleep", "stash", "serving video", "block")
	if err != nil {
		return err
	}
	return nil
}

func (s *linuxNoSleeper) Allow() error {
	if s.lockFd != nil {
		err := s.lockFd.Close()
		s.lockFd = nil
		return err
	}
	return nil
}
