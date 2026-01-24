//go:build linux
// +build linux

package nosleep

import (
	"os"

	"github.com/coreos/go-systemd/v22/login1"
)

type linuxNoSleeper struct {
	conn   *login1.Conn
	lockFd *os.File
}

func New() NoSleeper {
	conn, err := login1.New()
	if err != nil {
		return nil
	}
	return &linuxNoSleeper{conn: conn}
}

func (s *linuxNoSleeper) Prevent() error {
	var err error
	s.lockFd, err = s.conn.Inhibit(
		"sleep",
		"stash",
		"serving video",
		"block",
	)
	return err
}

func (s *linuxNoSleeper) Allow() error {
	if s.lockFd != nil {
		err := s.lockFd.Close()
		s.lockFd = nil
		return err
	}
	return nil
}
