//go:build darwin
// +build darwin

package nosleep

/*
#cgo LDFLAGS: -framework IOKit -framework CoreFoundation
#include <IOKit/pwr_mgt/IOPMLib.h>
#include <CoreFoundation/CoreFoundation.h>
// Function to create a sleep assertion
IOReturn createNoIdleSleepAssertion(CFStringRef reasonForActivity, IOPMAssertionID *assertionID) {
    return IOPMAssertionCreateWithName(
        kIOPMAssertionTypeNoIdleSleep,
        kIOPMAssertionLevelOn,
        reasonForActivity,
        assertionID
    );
}
// Function to release a sleep assertion
IOReturn releaseSleepAssertion(IOPMAssertionID assertionID) {
    return IOPMAssertionRelease(assertionID);
}
*/
import "C"
import (
	"fmt"
)

type darwinNoSleeper struct {
	assertionID C.IOPMAssertionID
}

func New() NoSleeper {
	return &darwinNoSleeper{}
}

func (s *darwinNoSleeper) Prevent() error {
	cReason := C.CFStringCreateWithCString(
		C.kCFAllocatorDefault,
		C.CString("stash is serving a video"),
		C.kCFStringEncodingUTF8,
	)
	if cReason == 0 {
		return fmt.Errorf("failed to create CFString for reason")
	}
	defer C.CFRelease(C.CFTypeRef(cReason))

	ret := C.createNoIdleSleepAssertion(cReason, &s.assertionID)
	if ret != C.kIOReturnSuccess {
		return fmt.Errorf("failed to create sleep assertion: %d", ret)
	}
	return nil
}

func (s *darwinNoSleeper) Allow() error {
	if s.assertionID != 0 {
		ret := C.releaseSleepAssertion(s.assertionID)
		if ret != C.kIOReturnSuccess {
			return fmt.Errorf("failed to release sleep assertion: %d", ret)
		}
		s.assertionID = 0
	}
	return nil
}
