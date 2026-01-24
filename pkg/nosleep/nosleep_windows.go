//go:build windows
// +build windows

package nosleep

import "C"
import (
	"fmt"
	"syscall"
)

const (
	esContinuous     = 0x80000000
	esSystemRequired = 0x00000001
)

var (
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	setThreadExecutionState = kernel32.NewProc("SetThreadExecutionState")
)

type windowsNoSleeper struct{}

func New() NoSleeper {
	return &windowsNoSleeper{}
}

func (s *windowsNoSleeper) Prevent() error {
	ret, _, err := setThreadExecutionState.Call(esContinuous | esSystemRequired)
	if ret == 0 {
		return fmt.Errorf("failed to set thread execution state: %w", err)
	}
	return nil
}

func (s *windowsNoSleeper) Allow() error {
	ret, _, err := setThreadExecutionState.Call(esContinuous)
	if ret == 0 {
		return fmt.Errorf("failed to set thread execution state: %w", err)
	}
	return nil
}
